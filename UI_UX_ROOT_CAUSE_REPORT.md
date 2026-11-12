# Flutter UI blank-screen audit: root-cause findings

Date: 2026-11-12

## Conclusion

The exact runtime cause of the reported public blank screen is **not established**.
The Flutter release build and widget tests succeed, but no browser console trace,
Network log, or live public browser session was available. The inspected startup
code does **not** wait on the API, PostgreSQL, or Socket.IO before building its
initial screen, so an ordinary backend outage does not explain a blank initial
Flutter surface by itself.

An exact runtime diagnosis needs the first browser console exception and the
failed resource/request (if any) from the affected page. Without that evidence,
claiming a specific rendering exception would be speculation.

## Startup path reviewed

1. `frontend/lib/main.dart` calls `runApp(const HospitalResourceApp())`
   synchronously.
2. `HospitalResourceApp` builds `MaterialApp` and its `Consumer<AuthProvider>`.
3. With no authenticated in-memory user, the consumer returns
   `LandingScreen` immediately.
4. `AuthProvider` starts `_loadUser()` from its constructor. That asynchronous
   preference/socket work is not awaited by `main()` or the `MaterialApp`
   builder. A socket connection failure is handled inside `SocketService` and
   does not gate the initial unauthenticated screen.
5. Login API work is only started after a user submits the login form.

Relevant source locations: `frontend/lib/main.dart:17-19` (`runApp`),
`frontend/lib/main.dart:32-58` (theme and initial landing screen),
`frontend/lib/theme/app_theme.dart:6-20` (synchronous theme construction), and
`frontend/web/index.html:44` (Flutter bootstrap script).

This rules out “API initialization must succeed before the login UI renders”
as the cause in the current code path. It does not rule out a synchronous
widget/theme exception, a browser-only plugin failure, a failed Flutter web
bootstrap/asset load, or a layout exception on a specific viewport; those
require runtime reproduction.

## UI-specific observations

- The initial surface is the large, animated `LandingScreen`, which contains
  custom-painted decoration and login/portal controls. It is not a minimal
  login-only screen.
- The current widget suite exercises the landing/login section and role
  dashboards at 360, 390, 768, 1024, 1366, and 1920 logical-pixel widths. The
  suite passed in this environment.
- `MaterialApp` has no app-level `ErrorWidget.builder` or explicit
  `FlutterError.onError` presentation. A synchronous build exception can
  therefore render Flutter's framework error UI rather than a product-level
  recovery screen. Whether this is occurring on the reported URL is unverified.
- No route parser/router is configured; the current app uses `home`, named
  routes, and imperative navigation. A direct nested URL / browser refresh
  behavior was not browser-tested.

## Generated web build inspection

A fresh release build completed. The generated output includes
`main.dart.js`, `flutter.js`, `flutter_bootstrap.js`, CanvasKit JS/WASM, and
`assets/FontManifest.json`; the referenced build artifacts exist locally. This
rules out a compile-time web build failure in this workspace. It does not
establish that ngrok/browser responses serve those files successfully, or that
the visitor's browser cache is using this build.

The build emitted a Wasm dry-run warning because `share_plus` and
`geolocator_web` depend on `dart:html`. The build itself succeeded using the
normal web output; the warning concerns Wasm compatibility and is not evidence
of the reported blank screen.

## Runtime evidence needed to finish diagnosis

From the affected Chrome browser, open DevTools with F12, enable **Console**
and **Network → Preserve log**, then hard-refresh with Ctrl+Shift+R. Send the
first red Console message plus stack, and the first failed Network request's
URL/path, status, and response. Redact JWTs, query credentials, and personal
data. Also report whether the page is white before Flutter starts, shows a
Flutter loading indicator, or shows a Flutter error screen. These distinguish
bootstrap/asset failure from a widget exception and from an API failure after
first render.

The desktop browser-control connector was unavailable in this session, and no
public ngrok URL was supplied in the thread, so these browser observations could
not be captured by the agent.

## Manual Chrome evidence collection

On the computer/phone where the blank page occurs:

1. Open the exact public `https://...` URL in Chrome. On desktop, press **F12**
   and select **Console**. Turn on **Preserve log**, clear the console, then
   hard-refresh with **Ctrl+Shift+R**. Copy the **first** red error and its
   complete stack; later errors may be consequences of the first one.
2. In DevTools **Network**, enable **Preserve log**, select **Disable cache**
   while DevTools is open, clear the request list, and hard-refresh again.
   Sort/filter by failed requests and capture the first red row. Include full
   request URL, status (or `(failed)`), response/body, and the Initiator column.
   Redact cookies, Authorization headers, JWTs, and personal data.
3. Verify these requests individually in Network and report status, content
   type, and initiator for each: document `/`, `flutter_bootstrap.js`,
   `main.dart.js`, renderer resources under `/canvaskit/` (or any selected
   renderer path), `assets/FontManifest.json`, and the first failing image or
   font. A 200 HTML response for a `.js`/`.wasm` URL suggests a fallback route
   or proxy response rather than the expected asset. Check Console for MIME,
   CSP, mixed-content, CORS, WebAssembly, and service-worker errors.
4. In Console, run `document.baseURI` and
   `document.querySelector('flt-glass-pane')`. Report the base URI and whether
   the Flutter host element exists. In Network, report whether `main.dart.js`
   downloaded and whether the renderer's `.wasm` request completed. Do not
   paste tokens or run commands that modify the app.
5. Report the viewport width/height (DevTools device toolbar can emulate the
   affected phone width) and whether the page is white, shows a Flutter loading
   canvas, or shows a Flutter framework error screen. If possible, capture a
   screenshot with Console visible.

Please send the full public HTTPS URL, first Console error/stack, first failed
Network request (URL/status/response), and viewport dimensions. With the URL,
the agent can compare the publicly served response to the fresh local
`frontend/build/web` output. Until those observations are available, no public
rendering cause or fix is claimed.

No port, ngrok, backend, or deployment configuration was inspected or changed
for this UI-only audit.
