#import <React/RCTBridgeModule.h>
#import <Metal/Metal.h>
#import <mach/mach.h>

@interface PerformanceMetrics : NSObject <RCTBridgeModule>
@property (nonatomic, strong) id<MTLDevice> sharedDevice;
@end

@implementation PerformanceMetrics

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        // Create a shared Metal device to track allocations
        _sharedDevice = MTLCreateSystemDefaultDevice();
    }
    return self;
}

RCT_EXPORT_METHOD(getMetrics:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    NSMutableDictionary *metrics = [NSMutableDictionary dictionary];
    
    // Get REAL CPU usage from Mach kernel thread_info API
    thread_array_t threadList;
    mach_msg_type_number_t threadCount;
    thread_info_data_t threadInfo;
    mach_msg_type_number_t threadInfoCount;
    
    float totalCPU = 0;
    BOOL isRealCpuUsage = NO;
    
    if (task_threads(mach_task_self(), &threadList, &threadCount) == KERN_SUCCESS) {
        for (int i = 0; i < threadCount; i++) {
            threadInfoCount = THREAD_INFO_MAX;
            if (thread_info(threadList[i], THREAD_BASIC_INFO, (thread_info_t)threadInfo, &threadInfoCount) == KERN_SUCCESS) {
                thread_basic_info_t basicInfo = (thread_basic_info_t)threadInfo;
                if (!(basicInfo->flags & TH_FLAGS_IDLE)) {
                    totalCPU += basicInfo->cpu_usage / (float)TH_USAGE_SCALE * 100.0;
                }
            }
        }
        vm_deallocate(mach_task_self(), (vm_offset_t)threadList, threadCount * sizeof(thread_t));
        isRealCpuUsage = YES; // Successfully read from Mach kernel API
    }
    
    metrics[@"cpuUsage"] = @(totalCPU);
    metrics[@"isRealCpuUsage"] = @(isRealCpuUsage);
    
    // Get detailed memory info using task_vm_info (includes graphics/IOKit memory)
    task_vm_info_data_t vmInfo;
    mach_msg_type_number_t vmInfoCount = TASK_VM_INFO_COUNT;
    
    if (task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&vmInfo, &vmInfoCount) == KERN_SUCCESS) {
        // phys_footprint is the total physical memory footprint including GPU textures
        metrics[@"memoryUsed"] = @(vmInfo.phys_footprint / 1024 / 1024); // MB
        
        // IOKit mappings often include GPU resources
        // internal + compressed gives us a good estimate of graphics memory
        NSUInteger graphicsEstimate = vmInfo.internal + vmInfo.compressed;
        
        // On iOS, GPU memory is part of unified memory, so we track it via IOKit/internal
        // The difference between phys_footprint and resident_size often indicates GPU usage
        struct task_basic_info basicInfo;
        mach_msg_type_number_t basicSize = TASK_BASIC_INFO_COUNT;
        if (task_info(mach_task_self(), TASK_BASIC_INFO, (task_info_t)&basicInfo, &basicSize) == KERN_SUCCESS) {
            // GPU memory estimate: footprint minus resident (CPU) memory
            NSInteger gpuEstimate = (NSInteger)(vmInfo.phys_footprint - basicInfo.resident_size);
            if (gpuEstimate > 0) {
                metrics[@"gpuMemoryUsed"] = @(gpuEstimate / 1024 / 1024); // MB
            } else {
                // Fallback: use internal memory as GPU estimate
                metrics[@"gpuMemoryUsed"] = @(vmInfo.internal / 1024 / 1024); // MB
            }
        } else {
            metrics[@"gpuMemoryUsed"] = @(graphicsEstimate / 1024 / 1024);
        }
    } else {
        // Fallback to basic info
        struct task_basic_info info;
        mach_msg_type_number_t size = TASK_BASIC_INFO_COUNT;
        if (task_info(mach_task_self(), TASK_BASIC_INFO, (task_info_t)&info, &size) == KERN_SUCCESS) {
            metrics[@"memoryUsed"] = @(info.resident_size / 1024 / 1024);
        } else {
            metrics[@"memoryUsed"] = @(0);
        }
        metrics[@"gpuMemoryUsed"] = @(0);
    }
    
    // Get GPU info using Metal - REAL metrics only, no estimation
    if (self.sharedDevice) {
        // currentAllocatedSize tracks REAL Metal allocations
        NSUInteger metalAlloc = self.sharedDevice.currentAllocatedSize;
        if (metalAlloc > 0) {
            // This is REAL GPU memory from Metal API
            metrics[@"gpuMemoryUsed"] = @(metalAlloc / 1024 / 1024);
            metrics[@"isRealGpuMemory"] = @(YES);
        } else {
            // Metal reports 0 (common on simulator) - don't estimate, just report 0
            metrics[@"gpuMemoryUsed"] = @(0);
            metrics[@"isRealGpuMemory"] = @(NO);
        }
        
        // recommendedMaxWorkingSetSize is REAL from Metal API
        if (@available(iOS 12.0, *)) {
            NSUInteger maxGpuMemory = self.sharedDevice.recommendedMaxWorkingSetSize;
            metrics[@"gpuMemoryTotal"] = @(maxGpuMemory / 1024 / 1024); // MB
        } else {
            metrics[@"gpuMemoryTotal"] = @(0);
        }
        
        // Check if running on simulator
        #if TARGET_OS_SIMULATOR
        metrics[@"gpuName"] = [NSString stringWithFormat:@"%@ (Sim)", self.sharedDevice.name];
        #else
        metrics[@"gpuName"] = self.sharedDevice.name ?: @"Apple GPU";
        #endif
        
        if (@available(iOS 13.0, *)) {
            metrics[@"hasUnifiedMemory"] = @(self.sharedDevice.hasUnifiedMemory);
        } else {
            metrics[@"hasUnifiedMemory"] = @(YES); // All iOS devices have unified memory
        }
    } else {
        metrics[@"gpuMemoryUsed"] = @(0);
        metrics[@"gpuMemoryTotal"] = @(0);
        metrics[@"gpuName"] = @"No Metal device";
        metrics[@"hasUnifiedMemory"] = @(YES);
        metrics[@"isRealGpuMemory"] = @(NO);
    }
    
    // Get total system memory
    metrics[@"memoryTotal"] = @([NSProcessInfo processInfo].physicalMemory / 1024 / 1024); // MB
    
    resolve(metrics);
}

@end
