#import <React/RCTBridgeModule.h>
#import <Metal/Metal.h>
#import <mach/mach.h>
#import <sys/resource.h>

@interface PerformanceMetrics : NSObject <RCTBridgeModule>
@property (nonatomic, strong) id<MTLDevice> sharedDevice;
@end

@implementation PerformanceMetrics {
    double _lastCpuTime;
    NSTimeInterval _lastWallTime;
}

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
    
    struct rusage usage;
    if (getrusage(RUSAGE_SELF, &usage) == 0) {
        double cpuCoresBusy = [self cpuCoresBusySince:usage];
        NSUInteger cpuCoreCount = MAX(1, [NSProcessInfo processInfo].activeProcessorCount);
        metrics[@"cpuCoresBusy"] = @(cpuCoresBusy);
        metrics[@"cpuCoreCount"] = @(cpuCoreCount);
        metrics[@"cpuUsage"] = @(MIN(100.0, cpuCoresBusy / cpuCoreCount * 100.0));
        metrics[@"isRealCpuUsage"] = @(YES);
    } else {
        metrics[@"cpuUsage"] = @(0);
        metrics[@"isRealCpuUsage"] = @(NO);
    }
    
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

// CPU time used by all of the app's threads since the previous call, divided by the
// wall time between the calls: the number of cores kept busy on average. 0 on the first call.
- (double)cpuCoresBusySince:(struct rusage)usage {
    double cpuTime = usage.ru_utime.tv_sec + usage.ru_utime.tv_usec / 1e6
                   + usage.ru_stime.tv_sec + usage.ru_stime.tv_usec / 1e6;
    NSTimeInterval wallTime = [NSProcessInfo processInfo].systemUptime;

    double coresBusy = 0;
    if (_lastWallTime > 0 && wallTime > _lastWallTime) {
        coresBusy = (cpuTime - _lastCpuTime) / (wallTime - _lastWallTime);
    }

    _lastCpuTime = cpuTime;
    _lastWallTime = wallTime;
    return MAX(0, coresBusy);
}

@end
