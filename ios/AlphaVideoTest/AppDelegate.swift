import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "AlphaVideoTest",
      in: window,
      launchOptions: launchOptions
    )

    watchPixelTestLinks()
    AlphaVideoDataSources.register(TestDataSource(), name: "test")
    return true
  }

  private var pixelTestTimer: Timer?
  private var lastPixelTestLink: String?

  /// The pixel-test driver (testing/pixels) writes each link to Documents/pixeltest/link.txt:
  /// `simctl openurl` would ask "Open in AlphaVideoTest?" every time.
  private func watchPixelTestLinks() {
    guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let folder = documents.appendingPathComponent("pixeltest")
    guard FileManager.default.fileExists(atPath: folder.path) else { return }
    let file = folder.appendingPathComponent("link.txt")
    pixelTestTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
      guard let self,
            let link = try? String(contentsOf: file, encoding: .utf8),
            link != self.lastPixelTestLink,
            let url = URL(string: link) else { return }
      self.lastPixelTestLink = link
      RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }
  }

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(app, open: url, options: options)
  }
}

/// The stream tests' data source (testing/streaming): reads each window with a URLSession range
/// request, as an app's own source would, marked by its user agent.
final class TestDataSource: NSObject, AlphaVideoDataSource {
  func read(
    url: URL, offset: Int64, length: Int64, headers: [String: String],
    response: @escaping (AlphaVideoDataInfo) -> Void,
    data: @escaping (Data) -> Void,
    completion: @escaping (Error?) -> Void
  ) -> AlphaVideoCancellable {
    var request = URLRequest(url: url)
    headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
    request.setValue("bytes=\(offset)-\(offset + length - 1)", forHTTPHeaderField: "Range")
    request.setValue("AlphaVideoTest-DataSource", forHTTPHeaderField: "User-Agent")
    let task = URLSession.shared.dataTask(with: request) { body, urlResponse, error in
      if let error { return completion(error) }
      guard let http = urlResponse as? HTTPURLResponse, http.statusCode == 206 || http.statusCode == 416,
            let total = http.value(forHTTPHeaderField: "Content-Range")?.split(separator: "/").last.flatMap({ Int64($0) })
      else { return completion(URLError(.badServerResponse)) }
      response(AlphaVideoDataInfo(
        size: total,
        etag: http.value(forHTTPHeaderField: "ETag"),
        lastModified: http.value(forHTTPHeaderField: "Last-Modified")))
      if http.statusCode == 206, let body, !body.isEmpty { data(body) }
      completion(nil)
    }
    task.resume()
    return task
  }
}

extension URLSessionTask: AlphaVideoCancellable {}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
