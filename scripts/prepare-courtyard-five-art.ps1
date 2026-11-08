# Import the moonlit stone and dandelion sprites without changing their source files.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $projectRoot 'public/sprites/courtyard-five'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$drawingRefs = @('System.Drawing.Common.dll', 'System.Drawing.Primitives.dll', 'System.Private.Windows.GdiPlus.dll', 'System.Private.Windows.Core.dll', 'System.Runtime.dll', 'System.Runtime.InteropServices.dll') | ForEach-Object { Join-Path $PSHOME $_ }
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class CourtyardFiveArt {
  public static Bitmap Load(string path) {
    var image = new Bitmap(path);
    var bits = image.LockBits(new Rectangle(0, 0, image.Width, image.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    var pixels = new byte[bits.Stride * image.Height];
    Marshal.Copy(bits.Scan0, pixels, 0, pixels.Length);
    for (int i = 0; i < pixels.Length; i += 4) if (pixels[i + 3] < 32)
      pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0;
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
  public static int[] Grid(Bitmap image, bool horizontal) {
    int size = horizontal ? image.Height : image.Width, across = horizontal ? image.Width : image.Height;
    var edges = new [] {0, 0, 0, 0, size};
    // Painted sprites can cross nominal cell edges. Find transparent separators near the quarters so a frame
    // never includes its neighbour's fluff.
    for (int i = 1; i < 4; i++) {
      int expected = (int)Math.Round(i * size / 4.0), limit = (int)(size / 4.0 * .18);
      edges[i] = expected;
      bool found = false;
      for (int distance = 0; distance <= limit && !found; distance++) foreach (int at in new [] {expected - distance, expected + distance}) {
        bool empty = true;
        for (int p = 0; p < across; p++) if ((horizontal ? image.GetPixel(p, at) : image.GetPixel(at, p)).A >= 96) { empty = false; break; }
        if (empty) { edges[i] = at; found = true; break; }
      }
      if (!found) throw new Exception("Could not separate dandelion sprite cells");
    }
    return edges;
  }
  public static int DeckRow(Bitmap image) {
    for (int y = 0; y < image.Height / 3; y++) {
      int count = 0;
      for (int x = 0; x < image.Width; x++) if (image.GetPixel(x, y).A >= 128) count++;
      if (count >= image.Width * .9) return y + 2;
    }
    throw new Exception("Could not find the stone deck");
  }
}
'@ -ReferencedAssemblies $drawingRefs

$stone = [ordered]@{}
foreach ($entry in @(@('picture/bridge/3.png', 'ground'), @('picture/bridge/31.png', 'floating-platform'))) {
  $image = [CourtyardFiveArt]::Load((Join-Path $projectRoot $entry[0]))
  try {
    $box = [CourtyardFiveArt]::Bounds($image, 0, 0, $image.Width, $image.Height)
    $path = Join-Path $destination "$($entry[1]).png"
    [CourtyardFiveArt]::Crop($image, $box, $path)
    $crop = [System.Drawing.Bitmap]::new($path)
    try { $stone[$entry[1]] = [ordered]@{ width=$crop.Width; height=$crop.Height; walk=[CourtyardFiveArt]::DeckRow($crop) } }
    finally { $crop.Dispose() }
    Write-Output "$($entry[1]) imported: $($box -join ',')"
  } finally { $image.Dispose() }
}
$dandelions = [ordered]@{}
foreach ($entry in @(@('3.png', 'dandelion-grow'), @('31.png', 'dandelion-wilt'), @('32.png', 'dandelion-idle'))) {
  $image = [CourtyardFiveArt]::Load((Join-Path $projectRoot "picture/生长平台/$($entry[0])"))
  try {
    $frames = @()
    $columns = [CourtyardFiveArt]::Grid($image, $false)
    $rows = [CourtyardFiveArt]::Grid($image, $true)
    for ($i = 0; $i -lt 16; $i++) {
      $column = $i % 4; $row = [int][Math]::Floor($i / 4)
      $x0 = $columns[$column]; $x1 = $columns[$column + 1]
      $y0 = $rows[$row]; $y1 = $rows[$row + 1]
      $box = [CourtyardFiveArt]::Bounds($image, $x0, $y0, $x1 - $x0, $y1 - $y0)
      $root = [CourtyardFiveArt]::Bounds($image, $box[0], $box[1] + [int][Math]::Floor($box[3] * .92), $box[2], [int][Math]::Ceiling($box[3] * .08))
      $frames += [ordered]@{ x=$box[0]; y=$box[1]; w=$box[2]; h=$box[3]; rootX=($root[0] + $root[2] / 2 - $box[0]) }
    }
    $image.Save((Join-Path $destination "$($entry[1]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $dandelions[$entry[1]] = $frames
    Write-Output "$($entry[1]) imported: 16 frames"
  } finally { $image.Dispose() }
}
$stoneJson = $stone | ConvertTo-Json -Depth 4 -Compress
$framesJson = $dandelions | ConvertTo-Json -Depth 6 -Compress
Set-Content -LiteralPath (Join-Path $projectRoot 'public/courtyard-five-art.js') -Value "// Generated from picture by scripts/prepare-courtyard-five-art.ps1.`nexport const MOON_STONE_ART = $stoneJson;`nexport const DANDELION_FRAMES = $framesJson;" -Encoding utf8
