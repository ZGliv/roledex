import UIKit
import Capacitor
import Security

@objc(SessionVaultPlugin)
final class SessionVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "SessionVaultPlugin"
    let jsName = "SessionVault"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private var keychainQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "native-session-v2",
            kSecAttrService as String:
                "\(Bundle.main.bundleIdentifier ?? "dev.jobswipe.preview").session-v2",
        ]
    }

    @objc func read(_ call: CAPPluginCall) {
        var query = keychainQuery
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8)
        else {
            reject(call, status: status)
            return
        }
        call.resolve(["value": value])
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), !value.isEmpty else {
            call.reject("A non-empty session value is required.", "INVALID_SESSION")
            return
        }
        let data = Data(value.utf8)
        let updates: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(
            keychainQuery as CFDictionary,
            updates as CFDictionary
        )

        if updateStatus == errSecSuccess {
            call.resolve()
            return
        }
        guard updateStatus == errSecItemNotFound else {
            reject(call, status: updateStatus)
            return
        }

        var insert = keychainQuery
        insert[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        insert[kSecValueData as String] = data
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        guard insertStatus == errSecSuccess else {
            reject(call, status: insertStatus)
            return
        }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(keychainQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            reject(call, status: status)
            return
        }
        call.resolve()
    }

    private func reject(_ call: CAPPluginCall, status: OSStatus) {
        let message = SecCopyErrorMessageString(status, nil) as String?
        call.reject(
            message ?? "Secure session storage failed.",
            "KEYCHAIN_\(status)"
        )
    }
}

final class JobSwipeBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SessionVaultPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = JobSwipeBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
