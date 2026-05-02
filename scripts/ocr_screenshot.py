import json
import sys

from rapidocr_onnxruntime import RapidOCR


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 ocr_screenshot.py <image-path>", file=sys.stderr)
        return 1

    image_path = sys.argv[1]
    engine = RapidOCR()
    result, _ = engine(image_path)
    observations = []

    for item in result or []:
        points, text, _score = item
        xs = [float(point[0]) for point in points]
        ys = [float(point[1]) for point in points]
        observations.append(
            {
                "text": str(text).strip(),
                "minX": min(xs),
                "maxX": max(xs),
                "minY": min(ys),
                "maxY": max(ys),
                "centerX": (min(xs) + max(xs)) / 2,
                "centerY": (min(ys) + max(ys)) / 2,
            }
        )

    json.dump(observations, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
