# Casaa Tune

Read-only dashboard for the **BYD Atto 3 / Kommu KA2** openpilot tune on
[`xynkro/bukapilot@casparstune`](https://github.com/xynkro/bukapilot/tree/casparstune).

Fetches the real source files from GitHub on every load and shows the live value of
every meaningful parameter, next to the Kommu upstream stock value, with an
explanation of what each one actually does.

**It cannot write anything.** No token, no auth, no commits — it only reads public files.

### Why some parameters are marked inert
- `kf` / `kpV` / `kiV` — the Atto 3 is `SteerControlType.angle`, so `LatControlAngle`
  is used, which has no PID. These are dead code on this car.
- Anything in `panda/byd.h` — the device never compiles from source (`prebuilt`
  marker), so it flashes Kommu's committed binary. Editing the C is inert.
- `RADAR_FREQ_HZ` — a declaration of the sensor's broadcast rate, not a request to it.

### Local
```
python3 -m http.server 8765
```
