# Import watercolor stone props and the fourth courtyard's flower, preserving the source files.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $projectRoot 'public/sprites/courtyard-two'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$drawingRefs = @('System.Drawing.Common.dll', 'System.Drawing.Primitives.dll', 'System.Private.Windows.GdiPlus.dll', 'System.Private.Windows.Core.dll', 'System.Runtime.dll', 'System.Runtime.InteropServices.dll') | ForEach-Object { Join-Path $PSHOME $_ }
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class CourtyardTwoArt {
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
    // The growing flowers are arranged in four rows, but the last row starts above the nominal cell edge.
    // Find a transparent separator near each quarter so one frame never includes its neighbour's petals.
    for (int i = 1; i < 4; i++) {
      int expected = (int)Math.Round(i * size / 4.0), limit = (int)(size / 4.0 * .18);
      edges[i] = expected;
      bool found = false;
      for (int distance = 0; distance <= limit && !found; distance++) foreach (int at in new [] {expected - distance, expected + distance}) {
        bool empty = true;
        for (int p = 0; p < across; p++) if ((horizontal ? image.GetPixel(p, at) : image.GetPixel(at, p)).A >= 96) { empty = false; break; }
        if (empty) { edges[i] = at; found = true; break; }
      }
      if (!found) throw new Exception("Could not separate flower sprite cells");
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
  public static int[] PoolBody(Bitmap image, int x, int y, int width, int height) {
    // The steam changes height; the wide stone rim anchors every frame to the same physical pool.
    for (int row = y + height / 3; row < y + height; row++) {
      int count = 0;
      for (int column = x; column < x + width; column++) if (image.GetPixel(column, row).A >= 96) count++;
      if (count >= width * .8) return Bounds(image, x, row, width, y + height - row);
    }
    throw new Exception("Could not find the water basin rim");
  }
}
'@ -ReferencedAssemblies $drawingRefs

$stone = [ordered]@{}
foreach ($entry in @(@('picture/bridge/2.png', 'ground'), @('picture/bridge/21.png', 'ground-tall'), @('picture/bridge/22.png', 'floating-platform'), @('picture/box/2.png', 'crate'))) {
  $image = [CourtyardTwoArt]::Load((Join-Path $projectRoot $entry[0]))
  try {
    $box = [CourtyardTwoArt]::Bounds($image, 0, 0, $image.Width, $image.Height)
    $path = Join-Path $destination "$($entry[1]).png"
    [CourtyardTwoArt]::Crop($image, $box, $path)
    if ($entry[1] -ne 'crate') {
      $crop = [System.Drawing.Bitmap]::new($path)
      try { $stone[$entry[1]] = [ordered]@{ width=$crop.Width; height=$crop.Height; walk=[CourtyardTwoArt]::DeckRow($crop) } }
      finally { $crop.Dispose() }
    }
    Write-Output "$($entry[1]) imported: $($box -join ',')"
  } finally { $image.Dispose() }
}
$rope = [CourtyardTwoArt]::Load((Join-Path $projectRoot 'picture/tool/绳子.png'))
try {
  $ropeFrames = @()
  for ($i = 0; $i -lt 4; $i++) {
    $x0 = [int][Math]::Round($i * $rope.Width / 4)
    $x1 = [int][Math]::Round(($i + 1) * $rope.Width / 4)
    $box = [CourtyardTwoArt]::Bounds($rope, $x0, 0, $x1 - $x0, $rope.Height)
    $ropeFrames += [ordered]@{ x=$box[0]; y=$box[1]; w=$box[2]; h=$box[3] }
  }
  $rope.Save((Join-Path $destination 'rope.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $rope.Dispose() }
$water = [CourtyardTwoArt]::Load((Join-Path $projectRoot 'picture/tool/水坑.png'))
try {
  $waterFrames = @()
  $columns = [CourtyardTwoArt]::Grid($water, $false)
  $rows = [CourtyardTwoArt]::Grid($water, $true)
  for ($i = 0; $i -lt 16; $i++) {
    $column = $i % 4; $row = [int][Math]::Floor($i / 4)
    $x0 = $columns[$column]; $x1 = $columns[$column + 1]
    $y0 = $rows[$row]; $y1 = $rows[$row + 1]
    $box = [CourtyardTwoArt]::Bounds($water, $x0, $y0, $x1 - $x0, $y1 - $y0)
    $body = [CourtyardTwoArt]::PoolBody($water, $x0, $y0, $x1 - $x0, $y1 - $y0)
    $waterFrames += [ordered]@{ x=$box[0]; y=$box[1]; w=$box[2]; h=$box[3]; body=[ordered]@{ x=$body[0]; y=$body[1]; w=$body[2]; h=$body[3] } }
  }
  $water.Save((Join-Path $destination 'water-pool.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output 'water-pool imported: 16 frames'
} finally { $water.Dispose() }
$cloud = [CourtyardTwoArt]::Load((Join-Path $projectRoot 'picture/tool/云.png'))
try {
  $box = [CourtyardTwoArt]::Bounds($cloud, 0, 0, $cloud.Width, $cloud.Height)
  [CourtyardTwoArt]::Crop($cloud, $box, (Join-Path $destination 'cloud.png'))
  Write-Output "cloud imported: $($box -join ',')"
} finally { $cloud.Dispose() }
$flowers = [ordered]@{}
foreach ($entry in @(@('2.png', 'flower-grow'), @('21.png', 'flower-wilt'), @('22.png', 'flower-idle'))) {
  $image = [CourtyardTwoArt]::Load((Join-Path $projectRoot "picture/生长平台/$($entry[0])"))
  try {
    $frames = @()
    $columns = [CourtyardTwoArt]::Grid($image, $false)
    $rows = [CourtyardTwoArt]::Grid($image, $true)
    for ($i = 0; $i -lt 16; $i++) {
      $column = $i % 4
      $row = [int][Math]::Floor($i / 4)
      $x0 = $columns[$column]; $x1 = $columns[$column + 1]
      $y0 = $rows[$row]; $y1 = $rows[$row + 1]
      $box = [CourtyardTwoArt]::Bounds($image, $x0, $y0, $x1 - $x0, $y1 - $y0)
      $root = [CourtyardTwoArt]::Bounds($image, $box[0], $box[1] + [int][Math]::Floor($box[3] * .92), $box[2], [int][Math]::Ceiling($box[3] * .08))
      $frames += [ordered]@{ x=$box[0]; y=$box[1]; w=$box[2]; h=$box[3]; rootX=($root[0] + $root[2] / 2 - $box[0]) }
    }
    $image.Save((Join-Path $destination "$($entry[1]).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $flowers[$entry[1]] = $frames
    Write-Output "$($entry[1]) imported: 16 frames"
  } finally { $image.Dispose() }
}
$stoneJson = $stone | ConvertTo-Json -Depth 4 -Compress
$ropeJson = ConvertTo-Json -InputObject $ropeFrames -Depth 3 -Compress
$flowerJson = $flowers | ConvertTo-Json -Depth 6 -Compress
$waterJson = ConvertTo-Json -InputObject $waterFrames -Depth 6 -Compress
Set-Content -LiteralPath (Join-Path $projectRoot 'public/courtyard-two-art.js') -Value "// Generated from picture by scripts/prepare-courtyard-two-art.ps1.`nexport const STONE_ART = $stoneJson;`nexport const ROPE_FRAMES = $ropeJson;`nexport const FLOWER_FRAMES = $flowerJson;`nexport const WATER_FRAMES = $waterJson;" -Encoding utf8
