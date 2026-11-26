# Kitchen Pass

Every dish hot at the same minute. Kitchen Pass works your dinner backwards from the serve time and calls
each step out like a restaurant pass: ticket chits on a rail, a service bell, a NOW stamp, a spindle for the done ones.

- **Backwards from serve:** each dish has where it cooks (oven, stove, counter), oven temperature, cook, rest and prep time, and an optional repeating check (baste every 45 min, stir every 5).
- **Oven clashes:** one oven can't hold two temperatures. Kitchen Pass finds the overlap and solves it: a dish shares a temperature within 25°F (with a "check early" note) or finishes early and is held warm. One or two ovens.
- **Service:** live mode on the real clock, bell + printer sounds + spoken call-outs ("Fire the stuffing"), notifications when the tab is hidden, screen kept awake. Tap SPIKE IT (or press space) when done.
- **Running late?** If the dinner should already have started, Kitchen Pass says which steps you missed and offers the earliest serve time that still lands every dish hot, in one tap.
- **On the heat now:** during service a strip shows every dish in the oven, on the stove, resting or held warm, with its time left.
- **Rehearse** the whole dinner fast-forwarded (×120, ×240, ×600), a timeline of every dish, °F/°C.
- **Share** a link that opens your exact menu, and save a printable prep ticket (PNG thermal receipt of every call).
- One HTML file. No account, no network, no tracking. Works offline. Your menu stays in your browser.

Use it: https://kitchen-pass.codepost.dev/

## Build

```sh
./build.sh          # runs the self-test (43 checks), then inlines src/core.js into app/index.html
node run-demo.mjs   # optional: runs the app in headless Chrome and saves PNGs to run/
```

## License

Copyright (C) 2026 Harman Kamboj

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, version 3.
It comes with no warranty. See [LICENSE](LICENSE) for the full text.

If you change it and let people use it over a network, you must offer them your source code under the same license.

The name "Kitchen Pass" and its logo are not covered by this license. Forks are welcome under a different name.
