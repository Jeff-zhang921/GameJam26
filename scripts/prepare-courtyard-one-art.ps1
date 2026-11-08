# Import the artist's source files without changing the originals.
# Run with pwsh -File scripts/prepare-courtyard-one-art.ps1.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $projectRoot 'public/sprites/courtyard-one'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$drawingRefs = @('System.Drawing.Common.dll', 'System.Drawing.Primitives.dll', 'System.Private.Windows.GdiPlus.dll', 'System.Private.Windows.Core.dll', 'System.Runtime.dll', 'System.Runtime.InteropServices.dll') | ForEach-Object { Join-Path $PSHOME $_ }
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class CourtyardArt {
  public static Bitmap Load(string path) {
    var image = new Bitmap(path);
    var rect = new Rectangle(0, 0, image.Width, image.Height);
    var bits = image.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    var pixels = new byte[bits.Stride * image.Height];
    Marshal.Copy(bits.Scan0, pixels, 0, pixels.Length);
    // Generated sources contain near-transparent coloured fringe. It must not affect bounds or filtering.
    for (int i = 0; i < pixels.Length; i += 4) if (pixels[i + 3] < 32) {
      pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
    }
    Marshal.Copy(pixels, 0, bits.Scan0, pixels.Length); image.UnlockBits(bits);
    return image;
  }
  public static int[] Bounds(Bitmap image, int ox, int oy, int width, int height) {
    int left = ox + width, top = oy + height, right = ox - 1, bottom = oy - 1;
    for (int y = oy; y < oy + height; y++) for (int x = ox; x < ox + width; x++) {
      if (image.GetPixel(x, y).A < 96) continue;
      left = Math.Min(left, x); top = Math.Min(top, y);
      right = Math.Max(right, x); bottom = Math.Max(bottom, y);
    }
    if (right < left) throw new Exception("Empty sprite frame");
    return new [] {left, top, right - left + 1, bottom - top + 1};
  }
  public static void Crop(Bitmap image, int[] box, string output) {
    using (var crop = image.Clone(new Rectangle(box[0], box[1], box[2], box[3]), PixelFormat.Format32bppArgb))
      crop.Save(output, ImageFormat.Png);
  }
  public static int DeckRow(Bitmap image) {
    // Ignore flowers above the ledge: feet belong on the first mostly-solid horizontal bridge row.
    for (int y = 0; y < image.Height / 3; y++) {
      int count = 0;
      for (int x = 0; x < image.Width; x++) if (image.GetPixel(x, y).A >= 128) count++;
      if (count >= image.Width * .9) return y + 2;
    }
    throw new Exception("Could not find the bridge deck");
  }
}
'@ -ReferencedAssemblies $drawingRefs

function Import-Single($source, $name) {
  $image = [CourtyardArt]::Load((Join-Path $projectRoot $source))
  try {
    $box = [CourtyardArt]::Bounds($image, 0, 0, $image.Width, $image.Height)
    [CourtyardArt]::Crop($image, $box, (Join-Path $destination "$name.png"))
    Write-Output "$name imported: $($box -join ',')"
  } finally { $image.Dispose() }
}

$frames = [ordered]@{}
foreach ($entry in @(@('1.png', 'leaf-grow'), @('11.png', 'leaf-wilt'), @('12.png', 'leaf-idle'))) {
  $image = [CourtyardArt]::Load((Join-Path $projectRoot "picture/生长平台/$($entry[0])"))
  try {
    $sheetFrames = @()
    for ($i = 0; $i -lt 16; $i++) {
      $x0 = [int][Math]::Round(($i % 4) * $image.Width / 4)
      $y0 = [int][Math]::Round([Math]::Floor($i / 4) * $image.Height / 4)
      $x1 = [int][Math]::Round((($i % 4) + 1) * $image.Width / 4)
      $y1 = [int][Math]::Round(([Math]::Floor($i / 4) + 1) * $image.Height / 4)
      $box = [CourtyardArt]::Bounds($image, $x0, $y0, $x1 - $x0, $y1 - $y0)
      # Root centre from the lowest part of the stem, rather than the canopy's bounding-box centre.
      $root = [CourtyardArt]::Bounds($image, $box[0], $box[1] + [int][Math]::Floor($box[3] * .92), $box[2], [int][Math]::Ceiling($box[3] * .08))
      $sheetFrames += [ordered]@{ x=$box[0]; y=$box[1]; w=$box[2]; h=$box[3]; rootX=($root[0] + $root[2] / 2 - $box[0]) }
    }
    $image.Save((Join-Path $destination "$($entry[1]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $frames[$entry[1]] = $sheetFrames
  } finally { $image.Dispose() }
}
Import-Single 'picture/bridge/1.png' 'bridge'
Import-Single 'picture/bridge/11.png' 'floating-platform'
Import-Single 'picture/box/1.png' 'crate'
Import-Single 'picture/道具/加速.png' 'bloom-charge'
Import-Single 'picture/道具/减速.png' 'still-charge'
$bridgeImage = [System.Drawing.Bitmap]::new((Join-Path $destination 'bridge.png'))
try {
  $bridgeArt = [ordered]@{ width=$bridgeImage.Width; height=$bridgeImage.Height; walk=[CourtyardArt]::DeckRow($bridgeImage); base=($bridgeImage.Height - 1); legs=@([int][Math]::Floor($bridgeImage.Height * .62), [int][Math]::Floor($bridgeImage.Height * .74)) }
} finally { $bridgeImage.Dispose() }
$floatingImage = [System.Drawing.Bitmap]::new((Join-Path $destination 'floating-platform.png'))
try {
  $floatingArt = [ordered]@{ width=$floatingImage.Width; height=$floatingImage.Height; walk=[CourtyardArt]::DeckRow($floatingImage) }
} finally { $floatingImage.Dispose() }
# The first growth frame is the matching collectible planting seed.
$seedImage = [CourtyardArt]::Load((Join-Path $projectRoot 'picture/生长平台/1.png'))
try {
  $seed = $frames['leaf-grow'][0]
  [CourtyardArt]::Crop($seedImage, @($seed.x, $seed.y, $seed.w, $seed.h), (Join-Path $destination 'seed.png'))
} finally { $seedImage.Dispose() }
$json = $frames | ConvertTo-Json -Depth 6 -Compress
$bridgeJson = $bridgeArt | ConvertTo-Json -Depth 3 -Compress
$floatingJson = $floatingArt | ConvertTo-Json -Depth 3 -Compress
Set-Content -LiteralPath (Join-Path $projectRoot 'public/courtyard-one-frames.js') -Value "// Generated from picture by scripts/prepare-courtyard-one-art.ps1.`nexport const LEAF_FRAMES = $json;`nexport const SKETCH_BRIDGE = $bridgeJson;`nexport const SKETCH_FLOATING_PLATFORM = $floatingJson;" -Encoding utf8
