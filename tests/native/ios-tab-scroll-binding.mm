// Runs the patched production finder/tracker against real UIKit view hierarchies.
#import <UIKit/UIKit.h>
#import "RNSScrollViewFinder.h"
#import "RNSTabContentScrollViewTracker.h"

static NSUInteger failures = 0;
static NSUInteger assertions = 0;

static void Check(BOOL condition, NSString *name)
{
  assertions++;
  if (!condition) {
    failures++;
    fprintf(stderr, "FAIL: %s\n", name.UTF8String);
  }
}

static void AfterUpdate(dispatch_block_t block)
{
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC), dispatch_get_main_queue(), block);
}

@interface BindingHost : UIViewController
@property (nonatomic) NSUInteger bindingChanges;
@property (nonatomic, weak) UIScrollView *boundList;
@end

@implementation BindingHost
- (void)setContentScrollView:(UIScrollView *)scrollView forEdge:(NSDirectionalRectEdge)edge
{
  [super setContentScrollView:scrollView forEdge:edge];
  if (edge == NSDirectionalRectEdgeBottom) {
    self.boundList = scrollView;
    self.bindingChanges++;
  }
}
@end

@interface TestDelegate : UIResponder <UIApplicationDelegate>
@property (nonatomic, strong) UIWindow *window;
@property (nonatomic, strong) RNSTabContentScrollViewTracker *tracker;
@end

@implementation TestDelegate
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options
{
  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  BindingHost *host = [BindingHost new];
  self.window.rootViewController = host;
  [self.window makeKeyAndVisible];
  dispatch_async(dispatch_get_main_queue(), ^{ [self runTests:host]; });
  return YES;
}

- (void)finish
{
  NSDictionary *result = @{@"assertions": @(assertions), @"failures": @(failures)};
  NSURL *directory = [NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
  [[NSJSONSerialization dataWithJSONObject:result options:0 error:nil]
      writeToURL:[directory URLByAppendingPathComponent:@"result.json"] atomically:YES];
  fprintf(stdout, "UIKit tab binding: %lu assertions, %lu failures\n", assertions, failures);
  fflush(stdout);
  exit(failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE);
}

- (void)runTests:(BindingHost *)host
{
  CGFloat width = host.view.bounds.size.width;
  CGFloat height = host.view.bounds.size.height;
  UIScrollView *pager = [[UIScrollView alloc] initWithFrame:host.view.bounds];
  pager.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
  pager.contentSize = CGSizeMake(width * 3, height);
  pager.pagingEnabled = YES;
  [host.view addSubview:pager];

  UIView *firstPage = [[UIView alloc] initWithFrame:CGRectMake(0, 0, width, height)];
  UIView *secondPage = [[UIView alloc] initWithFrame:CGRectMake(width, 0, width, height)];
  [pager addSubview:firstPage];
  [pager addSubview:secondPage];
  UIScrollView *first = [[UIScrollView alloc] initWithFrame:firstPage.bounds];
  UIScrollView *second = [[UIScrollView alloc] initWithFrame:secondPage.bounds];
  for (UIScrollView *list in @[first, second]) {
    list.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    list.contentSize = CGSizeMake(width, height * 4);
    list.alwaysBounceVertical = YES;
  }
  [firstPage addSubview:first];
  [secondPage addSubview:second];
  NSMutableSet<UIScrollView *> *containers = [NSMutableSet new];
  UIScrollView *(^resolve)(UIScrollView *) = ^UIScrollView *(UIScrollView *preferred) {
    [containers removeAllObjects];
    return [RNSScrollViewFinder findVisibleVerticalScrollViewFrom:host.view
                                                     preferred:preferred
                                          horizontalContainers:containers];
  };

  Check(resolve(nil) == first, @"initial visible page wins");
  Check([containers containsObject:pager] && ![containers containsObject:first], @"only pager is observed");
  pager.contentOffset = CGPointMake(width, 0);
  Check(resolve(first) == second, @"offscreen preferred first list cannot win");
  // Mount order does not identify the selected page.
  [pager bringSubviewToFront:firstPage];
  Check(resolve(first) == second, @"reordering cached pages does not change visible selection");
  pager.contentOffset = CGPointMake(width * 0.5, 0);
  Check(resolve(first) == first && resolve(second) == second, @"equal visibility keeps the existing binding");
  pager.contentOffset = CGPointMake(width * 0.75, 0);
  Check(resolve(first) == second, @"larger visible page wins during swipe");
  pager.contentOffset = CGPointMake(width, 0);
  secondPage.hidden = YES;
  Check(resolve(second) == nil, @"hidden page does not fall back to offscreen cached list");
  secondPage.hidden = NO;
  secondPage.alpha = 0;
  Check(resolve(second) == nil, @"transparent ancestors are excluded");
  secondPage.alpha = 1;
  secondPage.userInteractionEnabled = NO;
  Check(resolve(second) == nil, @"inactive ancestors are excluded");
  secondPage.userInteractionEnabled = YES;
  second.scrollEnabled = NO;
  Check(resolve(second) == nil, @"disabled lists are excluded");
  second.scrollEnabled = YES;
  second.contentSize = CGSizeMake(width, 0);
  Check(resolve(nil) == second, @"short bounceable list remains eligible before data loads");
  second.alwaysBounceVertical = NO;
  second.contentInset = UIEdgeInsetsMake(0, 0, height * 2, 0);
  Check(resolve(nil) == second, @"insets count towards scrollable content");
  second.contentInset = UIEdgeInsetsMake(0, 20, height * 2, 20);
  Check(resolve(nil) == second, @"horizontal safe area insets do not turn a vertical list into a pager");
  second.contentInset = UIEdgeInsetsZero;
  second.alwaysBounceVertical = YES;
  second.contentSize = CGSizeMake(width, height * 4);
  UIScrollView *carousel = [[UIScrollView alloc] initWithFrame:CGRectMake(0, 0, width, 100)];
  carousel.alwaysBounceVertical = YES;
  carousel.alwaysBounceHorizontal = YES;
  carousel.contentSize = CGSizeMake(width * 5, 100);
  [second addSubview:carousel];
  Check(resolve(nil) == second && ![containers containsObject:carousel], @"outer list owns nested carousel");
  pager.contentOffset = CGPointMake(width * 2, 0);
  Check(resolve(second) == nil, @"unmounted current page does not reuse offscreen list");
  pager.contentOffset = CGPointZero;

  self.tracker = [[RNSTabContentScrollViewTracker alloc] initWithViewController:host];
  [self.tracker setActive:YES];
  AfterUpdate(^{
    Check(host.boundList == first, @"activation registers initial list with UIKit");
    NSUInteger beforeVerticalScroll = host.bindingChanges;
    first.contentOffset = CGPointMake(0, 120);
    AfterUpdate(^{
      Check(host.bindingChanges == beforeVerticalScroll, @"vertical scrolling does not rebind");
      pager.contentOffset = CGPointMake(width, 0);
      AfterUpdate(^{
        Check(host.boundList == second, @"pager bounds observation explicitly rebinds UIKit");
        pager.contentOffset = CGPointMake(width * 0.25, 0);
        AfterUpdate(^{
          Check(host.boundList == first, @"cancelled swipe restores the visible list");
          [self.tracker setActive:NO];
          NSUInteger beforeInactiveSwipe = host.bindingChanges;
          pager.contentOffset = CGPointMake(width, 0);
          AfterUpdate(^{
            Check(host.bindingChanges == beforeInactiveSwipe, @"inactive screen removes observations");
            [self.tracker setActive:YES];
            AfterUpdate(^{
              Check(host.boundList == second, @"returning to screen refreshes visible list");
              [self.tracker setActive:NO];
              NSUInteger beforeSamePageReturn = host.bindingChanges;
              [self.tracker setActive:YES];
              AfterUpdate(^{
              Check(host.boundList == second && host.bindingChanges > beforeSamePageReturn,
                    @"returning to same page reasserts UIKit binding");
              [second removeFromSuperview];
              [self.tracker setNeedsUpdate]; // Fabric mounting transaction callback.
              AfterUpdate(^{
                Check(host.boundList == nil, @"removing active list clears stale binding");
                [secondPage addSubview:second];
                [self.tracker setNeedsUpdate];
                AfterUpdate(^{
                  Check(host.boundList == second, @"lazy mount restores binding");
                  __weak RNSTabContentScrollViewTracker *weakTracker = self.tracker;
                  self.tracker = nil;
                  Check(weakTracker == nil, @"tracker has no controller or observer retain cycle");
                  pager.contentOffset = CGPointZero;
                  AfterUpdate(^{ [self finish]; });
                });
              });
              });
            });
          });
        });
      });
    });
  });
}
@end

int main(int argc, char *argv[])
{
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass(TestDelegate.class));
  }
}
