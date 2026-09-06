#Download and verify the third-party inputs for the geography build.
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

THIS_FOLDER = Path(__file__).resolve().parent
MANIFEST_PATH = THIS_FOLDER / "source_manifest.json"
DEFAULT_DESTINATION = THIS_FOLDER / "external_sources"

# needed to perform security checks on the downloaded file (the checksum are in MANIFEST_PATH)
def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    request = Request(url, headers={"User-Agent": "Olympic-Cold-War-DataViz/1.0"})
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)


def materialize_download(temporary_path: Path, source: dict) -> Path:
    """Return the uncompressed source file when the upstream download is gzip."""
    if source.get("compression") != "gzip":
        return temporary_path

    with tempfile.NamedTemporaryFile(
        prefix=f".{source['filename']}.",
        dir=temporary_path.parent,
        delete=False,
    ) as extracted:
        extracted_path = Path(extracted.name)
        with gzip.open(temporary_path, "rb") as compressed:
            while chunk := compressed.read(1024 * 1024):
                extracted.write(chunk)
    temporary_path.unlink()
    return extracted_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=DEFAULT_DESTINATION)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Download pinned sources again even when a verified local snapshot exists.",
    )
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for source_name in ["cshapes", "countrycode", "countries"]:
        source = manifest["sources"][source_name]
        destination = args.destination / source["filename"]

        if destination.exists() and not args.refresh:
            actual = sha256(destination)
            if actual != source["sha256"]:
                raise SystemExit(
                    f"Checksum mismatch for {destination}: {actual}; expected {source['sha256']}"
                )
            print(f"[verified] {destination.name}")
            continue

        with tempfile.NamedTemporaryFile(
            prefix=f".{destination.name}.", dir=destination.parent, delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
        try:
            print(f"[download] {source['url']}")
            download(source["url"], temporary_path)
            temporary_path = materialize_download(temporary_path, source)
            actual = sha256(temporary_path)
            if actual != source["sha256"]:
                raise SystemExit(
                    f"Downloaded checksum mismatch for {source_name}: {actual}; "
                    f"expected {source['sha256']}"
                )
            temporary_path.replace(destination)
        finally:
            temporary_path.unlink(missing_ok=True)

    print("All external geography sources are present and verified.")


if __name__ == "__main__":
    main()
