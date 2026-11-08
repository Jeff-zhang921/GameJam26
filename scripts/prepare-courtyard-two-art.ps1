# Import the second courtyard's watercolor art without changing its source files.
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
$stoneJson = $stone | ConvertTo-Json -Depth 4 -Compress
$ropeJson = ConvertTo-Json -InputObject $ropeFrames -Depth 3 -Compress
Set-Content -LiteralPath (Join-Path $projectRoot 'public/courtyard-two-art.js') -Value "// Generated from picture by scripts/prepare-courtyard-two-art.ps1.`nexport const STONE_ART = $stoneJson;`nexport const ROPE_FRAMES = $ropeJson;" -Encoding utf8
