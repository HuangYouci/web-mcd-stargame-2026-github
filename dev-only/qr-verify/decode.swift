// 讀取 render-png.mjs 產生的 manifest，用 CoreImage 解碼每張 PNG 並比對原文。
// 用法：swift dev-only/qr-verify/decode.swift <manifest.json>
import CoreImage
import Foundation

struct Sample: Decodable {
  let file: String
  let text: String
  let version: Int
}

guard CommandLine.arguments.count > 1 else {
  FileHandle.standardError.write("decode | 缺少 manifest 路徑\n".data(using: .utf8) ?? Data())
  exit(2)
}

let manifestURL = URL(fileURLWithPath: CommandLine.arguments[1])
let samples = try JSONDecoder().decode([Sample].self, from: Data(contentsOf: manifestURL))
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])

var failures = 0
for sample in samples {
  guard let image = CIImage(contentsOf: URL(fileURLWithPath: sample.file)) else {
    print("FAIL v\(sample.version) 無法讀取圖檔 \(sample.file)")
    failures += 1
    continue
  }
  let decoded = detector?.features(in: image).compactMap { ($0 as? CIQRCodeFeature)?.messageString }.first
  if decoded == sample.text {
    print("PASS v\(sample.version) \(sample.text.prefix(40))")
  } else {
    print("FAIL v\(sample.version) 期望 \(sample.text.prefix(40)) 實得 \(decoded ?? "nil")")
    failures += 1
  }
}
print("total \(samples.count) failed \(failures)")
exit(failures == 0 && samples.count > 0 ? 0 : 1)
