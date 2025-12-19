import sys


def main():
    # Usage: python3 scripts/rembg_cutout.py input_image output_png
    if len(sys.argv) != 3:
        print("usage: rembg_cutout.py <input_image> <output_png>", file=sys.stderr)
        return 2

    inp = sys.argv[1]
    outp = sys.argv[2]

    try:
        from rembg import remove  # type: ignore
    except Exception as e:
        print(f"rembg not available: {e}", file=sys.stderr)
        return 3

    try:
        with open(inp, "rb") as f:
            data = f.read()
        result = remove(data)
        with open(outp, "wb") as f:
            f.write(result)
        return 0
    except Exception as e:
        print(f"rembg failed: {e}", file=sys.stderr)
        return 4


if __name__ == "__main__":
    raise SystemExit(main())


