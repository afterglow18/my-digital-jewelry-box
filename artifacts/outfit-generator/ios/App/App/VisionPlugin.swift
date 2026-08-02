import Capacitor
import Vision
import UIKit

/// Capacitor plugin wrapping VNClassifyImageRequest (object/scene labels) and
/// VNRecognizeTextRequest (OCR). Both run on a background queue and return
/// to JS via a single Promise.  All errors are swallowed — callers get empty
/// arrays so text search still works even if Vision fails.
@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyze(_ call: CAPPluginCall) {
        guard let dataUrl = call.getString("dataUrl"),
              let image   = imageFromDataUrl(dataUrl),
              let cgImage = image.cgImage else {
            call.resolve(["labels": [], "text": []])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            var labels: [String] = []
            var texts:  [String] = []
            let group = DispatchGroup()

            // ── Classification ───────────────────────────────────────────────
            group.enter()
            let classRequest = VNClassifyImageRequest { request, _ in
                defer { group.leave() }
                labels = (request.results as? [VNClassificationObservation] ?? [])
                    .filter { $0.confidence >= 0.3 }
                    .map    { $0.identifier }
            }

            // ── Text recognition ─────────────────────────────────────────────
            group.enter()
            let textRequest = VNRecognizeTextRequest { request, _ in
                defer { group.leave() }
                texts = (request.results as? [VNRecognizedTextObservation] ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
            }
            textRequest.recognitionLevel = .accurate

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            try? handler.perform([classRequest, textRequest])

            group.wait()
            call.resolve(["labels": labels, "text": texts])
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private func imageFromDataUrl(_ dataUrl: String) -> UIImage? {
        // Strip "data:<mime>;base64," prefix
        var base64 = dataUrl
        if let commaIdx = base64.firstIndex(of: ",") {
            base64 = String(base64[base64.index(after: commaIdx)...])
        }
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            return nil
        }
        return UIImage(data: data)
    }
}
