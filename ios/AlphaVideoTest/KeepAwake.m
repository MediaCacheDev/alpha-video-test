#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface KeepAwake : NSObject <RCTBridgeModule>
@end

@implementation KeepAwake

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_METHOD(activate) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UIApplication sharedApplication] setIdleTimerDisabled:YES];
  });
}

RCT_EXPORT_METHOD(deactivate) {
  dispatch_async(dispatch_get_main_queue(), ^{
    [[UIApplication sharedApplication] setIdleTimerDisabled:NO];
  });
}

@end
