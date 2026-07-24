#if os(iOS)
import SwiftUI
import UIKit

/// The composer's attachment button, backed by UIKit.
///
/// A SwiftUI `Menu` cannot be used here. Anywhere inside the composer it makes
/// iOS 26 treat the composer's `glassEffect` surface as the menu's presentation
/// source and morph that surface into the menu, so the whole input field
/// disappears while the menu is open -- with or without the keyboard, and
/// regardless of button or menu style. A `UIButton` presents its own menu
/// through UIKit, which knows nothing about the SwiftUI glass layer, so only
/// the button lifts and the composer stays put.
///
/// Being an ordinary child of the glass content layer is what makes the plus
/// track the composer's Liquid Glass highlight, so this must not be lifted out
/// into an overlay.
struct AttachmentMenuButton: UIViewRepresentable {
    func makeUIView(context: Context) -> UIButton {
        var configuration = UIButton.Configuration.plain()
        configuration.image = UIImage(
            systemName: "plus",
            withConfiguration: UIImage.SymbolConfiguration(textStyle: .title2)
        )
        configuration.contentInsets = .zero

        let button = UIButton(configuration: configuration)
        button.tintColor = .label
        button.accessibilityLabel = "Add"
        // Present on touch-up rather than on long press, and let UIKit lift the
        // button into the menu -- which is what clears the plus from the
        // composer for as long as the menu is open.
        button.showsMenuAsPrimaryAction = true
        button.menu = UIMenu(children: [
            UIMenu(
                options: [.displayInline, .displayAsPalette],
                children: [
                    UIAction(
                        title: "Camera",
                        image: UIImage(systemName: "camera")
                    ) { _ in
                        // TODO: Present camera capture.
                    },
                    UIAction(
                        title: "Photos",
                        image: UIImage(systemName: "photo")
                    ) { _ in
                        // TODO: Present the photo picker.
                    },
                    UIAction(
                        title: "Files",
                        image: UIImage(systemName: "folder")
                    ) { _ in
                        // TODO: Present the file importer.
                    },
                ]
            )
        ])
        return button
    }

    func updateUIView(_ uiView: UIButton, context: Context) {}
}
#endif
