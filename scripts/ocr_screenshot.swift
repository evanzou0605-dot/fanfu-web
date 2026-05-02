import AppKit
import Foundation
import Vision

struct OCRObservation: Codable {
    let text: String
    let minX: Double
    let maxX: Double
    let minY: Double
    let maxY: Double
    let centerX: Double
    let centerY: Double
}

func loadCGImage(from path: String) -> CGImage? {
    guard let image = NSImage(contentsOfFile: path) else {
        return nil
    }
    var rect = CGRect(origin: .zero, size: image.size)
    return image.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

func recognizeText(in image: CGImage) throws -> [OCRObservation] {
    var recognized: [OCRObservation] = []
    let request = VNRecognizeTextRequest { request, error in
        if let error {
            fputs("OCR failed: \(error.localizedDescription)\n", stderr)
            return
        }
        guard let results = request.results as? [VNRecognizedTextObservation] else {
            return
        }
        recognized = results.compactMap { observation in
            guard let candidate = observation.topCandidates(1).first else {
                return nil
            }
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else {
                return nil
            }
            let box = observation.boundingBox
            return OCRObservation(
                text: text,
                minX: Double(box.minX),
                maxX: Double(box.maxX),
                minY: Double(box.minY),
                maxY: Double(box.maxY),
                centerX: Double((box.minX + box.maxX) / 2),
                centerY: Double((box.minY + box.maxY) / 2)
            )
        }
    }
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.015

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    return recognized
}

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: swift ocr_screenshot.swift <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
guard let image = loadCGImage(from: imagePath) else {
    fputs("Unable to open image: \(imagePath)\n", stderr)
    exit(2)
}

do {
    let observations = try recognizeText(in: image)
    let data = try JSONEncoder().encode(observations)
    FileHandle.standardOutput.write(data)
} catch {
    fputs("OCR error: \(error.localizedDescription)\n", stderr)
    exit(3)
}
