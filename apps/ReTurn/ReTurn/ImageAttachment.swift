import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ImageAttachment {
    enum AttachmentError: LocalizedError {
        case invalidImage
        case tooLarge

        var errorDescription: String? {
            switch self {
            case .invalidImage: "The selected file is not a supported image"
            case .tooLarge: "The image could not be reduced enough to upload"
            }
        }
    }

    static func dataURL(from data: Data) throws -> String {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            throw AttachmentError.invalidImage
        }

        for size in [1024, 768, 512, 384] {
            guard let image = CGImageSourceCreateThumbnailAtIndex(
                source,
                0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceThumbnailMaxPixelSize: size,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                ] as CFDictionary
            ) else { continue }

            for quality in [0.7, 0.5, 0.35, 0.2] {
                let output = NSMutableData()
                guard let destination = CGImageDestinationCreateWithData(
                    output,
                    UTType.jpeg.identifier as CFString,
                    1,
                    nil
                ) else { continue }
                CGImageDestinationAddImage(
                    destination,
                    image,
                    [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
                )
                guard CGImageDestinationFinalize(destination) else { continue }
                let encoded = (output as Data).base64EncodedString()
                let value = "data:image/jpeg;base64,\(encoded)"
                if value.count <= 50_000 { return value }
            }
        }
        throw AttachmentError.tooLarge
    }
}
