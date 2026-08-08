$source = @'
using System;
using System.Runtime.InteropServices;

namespace TeemoDesktopPet
{
    public static class MouseState
    {
        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int virtualKey);
    }
}
'@

Add-Type -TypeDefinition $source -ErrorAction SilentlyContinue

$leftMouseButton = 0x01
$longPressMilliseconds = 420
$initialDetectionMilliseconds = 160

while (($command = [Console]::In.ReadLine()) -ne $null) {
    if ($command.Trim() -ne 'probe') { continue }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $sawPressed = $false
    while ($true) {
        $isPressed = (([TeemoDesktopPet.MouseState]::GetAsyncKeyState($leftMouseButton) -band 0x8000) -ne 0)
        if ($isPressed) {
            $sawPressed = $true
        }
        elseif ($sawPressed -or $stopwatch.ElapsedMilliseconds -ge $initialDetectionMilliseconds) {
            break
        }

        Start-Sleep -Milliseconds 16
    }

    $result = if ($sawPressed -and $stopwatch.ElapsedMilliseconds -ge $longPressMilliseconds) { 'long' } else { 'short' }
    [Console]::Out.WriteLine($result)
    [Console]::Out.Flush()
}
