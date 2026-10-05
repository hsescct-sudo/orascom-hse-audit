package com.orascom.hseaudit;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * HSE Flash Audit as an Android app: the live system in a full-screen WebView,
 * with the phone camera and gallery for photos, file picking for Excel imports,
 * and reports (PowerPoint, Excel) saved to the phone's Downloads folder.
 */
public class MainActivity extends Activity {
    private static final String TAG = "HSEAudit";
    static final String HOME = "https://hsescct-sudo.github.io/orascom-hse-audit/";
    private static final String HOST = "hsescct-sudo.github.io";
    private static final String PATH = "/orascom-hse-audit";
    private static final int REQ_FILES = 1001;

    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private boolean showingOffline;
    private boolean selfTest;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(0xFF003876);

        web = new WebView(this);
        web.setBackgroundColor(0xFFF4F6F9);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP);
        root.addView(progress, lp);
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " HSEAuditApp/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "HSEAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            // Blob downloads go through the bridge (see js/ui.js); anything else opens outside the app.
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) openOutside(Uri.parse(url));
        });

        // Debug builds only: the emulator check on GitHub saves a small file through the bridge.
        selfTest = BuildConfig.DEBUG && getIntent() != null && getIntent().getBooleanExtra("selftest", false);
        Uri start = getIntent() != null ? getIntent().getData() : null;
        if (saved != null) {
            web.restoreState(saved);
        } else if (start != null && isOurs(start)) {
            web.loadUrl(start.toString());
        } else {
            web.loadUrl(HOME);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Uri u = intent.getData();
        if (u != null && isOurs(u)) web.loadUrl(u.toString());
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static boolean isOurs(Uri u) {
        String host = u.getHost();
        String path = u.getPath() == null ? "" : u.getPath();
        return "https".equals(u.getScheme()) && HOST.equals(host) && path.startsWith(PATH);
    }

    private static boolean isAllowedInside(Uri u) {
        String scheme = u.getScheme();
        String host = u.getHost() == null ? "" : u.getHost();
        if ("blob".equals(scheme) || "data".equals(scheme) || "about".equals(scheme)) return true;
        if (!"https".equals(scheme)) return false;
        return isOurs(u) || host.endsWith(".supabase.co") || host.endsWith(".supabase.in");
    }

    private void openOutside(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    // ---------------------------------------------------------------- pages

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isAllowedInside(u)) return false;
            openOutside(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            Log.i(TAG, "page started " + url);
            progress.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            Log.i(TAG, "page finished " + url);
            progress.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
            if (selfTest && !showingOffline) {
                selfTest = false;
                view.evaluateJavascript("(function(){var id=HSEAndroid.begin('HSE_Audit_selftest.txt','text/plain');"
                        + "HSEAndroid.append(id,btoa('HSE Audit app self test'));return HSEAndroid.finish(id);})()",
                        v -> Log.i(TAG, "selftest finish=" + v));
            }
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                Log.w(TAG, "Page failed: " + error.getErrorCode() + " " + error.getDescription());
                showOffline();
            }
        }
    }

    private void showOffline() {
        showingOffline = true;
        String html = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<style>body{margin:0;font-family:sans-serif;background:#F4F6F9;color:#14213D;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}"
                + ".c{padding:32px;max-width:340px}h1{font-size:20px;color:#003876;margin:0 0 8px}p{font-size:15px;line-height:1.5;color:#46536A}"
                + "button{margin-top:16px;background:#003876;color:#fff;border:0;border-radius:8px;padding:12px 28px;font-size:16px}</style></head>"
                + "<body><div class=c><h1>No connection</h1><p>HSE Audit needs mobile data or Wi-Fi. Check the connection and try again.</p>"
                + "<button onclick=\"location.href='" + HOME + "'\">Try again</button></div></body></html>";
        web.loadDataWithBaseURL(HOME, html, "text/html", "utf-8", null);
    }

    // ---------------------------------------------------------------- photos and files

    private class Chrome extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progress.setProgress(newProgress);
            progress.setVisibility(newProgress < 100 ? View.VISIBLE : View.GONE);
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            Log.d(TAG, "console " + m.messageLevel() + ": " + m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraUri = null;

            String[] accept = params.getAcceptTypes();
            boolean images = isImagesOnly(accept);
            boolean multiple = params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
            Intent camera = images ? cameraIntent() : null;

            // The "Camera" button (capture) opens the camera straight away.
            if (images && params.isCaptureEnabled() && camera != null) {
                try {
                    startActivityForResult(camera, REQ_FILES);
                    return true;
                } catch (ActivityNotFoundException e) {
                    Log.w(TAG, "No camera app", e);
                }
            }

            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            if (images) {
                pick.setType("image/*");
            } else {
                String[] mimes = mimeTypes(accept);
                pick.setType(mimes.length == 1 ? mimes[0] : "*/*");
                if (mimes.length > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes);
            }
            if (multiple) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

            Intent chooser = Intent.createChooser(pick, images ? "Add photo" : "Choose file");
            if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            try {
                startActivityForResult(chooser, REQ_FILES);
                return true;
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                Toast.makeText(MainActivity.this, "No app can pick files on this phone.", Toast.LENGTH_SHORT).show();
                return false;
            }
        }
    }

    private static boolean isImagesOnly(String[] accept) {
        if (accept == null || accept.length == 0) return false;
        boolean any = false;
        for (String a : accept) {
            if (a == null || a.trim().isEmpty()) continue;
            any = true;
            String t = a.trim().toLowerCase();
            if (!(t.startsWith("image/") || t.equals(".jpg") || t.equals(".jpeg") || t.equals(".png"))) return false;
        }
        return any;
    }

    private static String[] mimeTypes(String[] accept) {
        List<String> out = new ArrayList<>();
        if (accept != null) {
            for (String a : accept) {
                if (a == null) continue;
                for (String part : a.split(",")) {
                    String t = part.trim().toLowerCase();
                    if (t.isEmpty()) continue;
                    String m;
                    switch (t) {
                        case ".xlsx": m = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
                        case ".xlsm": m = "application/vnd.ms-excel.sheet.macroEnabled.12"; break;
                        case ".xls": m = "application/vnd.ms-excel"; break;
                        case ".csv": m = "text/csv"; break;
                        case ".pdf": m = "application/pdf"; break;
                        default: m = t.contains("/") ? t : null;
                    }
                    if (m != null && !out.contains(m)) out.add(m);
                }
            }
        }
        // Some file managers label Excel files as generic binary; keep that open too.
        if (!out.isEmpty() && !out.contains("*/*") && out.get(0).contains("spreadsheet")) out.add("application/octet-stream");
        if (out.isEmpty()) out.add("*/*");
        return out.toArray(new String[0]);
    }

    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File f = File.createTempFile("IMG_", ".jpg", dir);
            cameraUri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            i.setClipData(ClipData.newRawUri("photo", cameraUri));
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return i;
        } catch (IOException | IllegalArgumentException e) {
            Log.w(TAG, "Camera file", e);
            cameraUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_FILES || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK) {
            ClipData clip = data != null ? data.getClipData() : null;
            Uri single = data != null ? data.getData() : null;
            if (clip != null && clip.getItemCount() > 0 && !(cameraUri != null && clip.getItemCount() == 1 && cameraUri.equals(clip.getItemAt(0).getUri()))) {
                List<Uri> list = new ArrayList<>();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) list.add(u);
                }
                result = list.toArray(new Uri[0]);
            } else if (single != null) {
                result = new Uri[]{single};
            } else if (cameraUri != null && hasContent(cameraUri)) {
                result = new Uri[]{cameraUri};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraUri = null;
    }

    private boolean hasContent(Uri u) {
        try (InputStream in = getContentResolver().openInputStream(u)) {
            return in != null && in.read() != -1;
        } catch (IOException | SecurityException e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- reports saved to the phone

    /** Called from the page: js/ui.js saveBlob() sends the file in base64 chunks. */
    private class Bridge {
        private final Map<String, File> parts = new HashMap<>();
        private final Map<String, String[]> meta = new HashMap<>();
        private int next = 0;

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public synchronized String begin(String name, String mime) {
            try {
                String id = "f" + (next++);
                File dir = new File(getCacheDir(), "downloads");
                if (!dir.exists()) dir.mkdirs();
                File tmp = File.createTempFile("dl_", ".part", dir);
                parts.put(id, tmp);
                meta.put(id, new String[]{safeName(name), mime == null || mime.isEmpty() ? guessMime(name) : mime});
                return id;
            } catch (IOException e) {
                Log.e(TAG, "begin", e);
                return "";
            }
        }

        @JavascriptInterface
        public synchronized boolean append(String id, String base64) {
            File tmp = parts.get(id);
            if (tmp == null) return false;
            try (FileOutputStream out = new FileOutputStream(tmp, true)) {
                out.write(Base64.decode(base64, Base64.DEFAULT));
                return true;
            } catch (IOException | IllegalArgumentException e) {
                Log.e(TAG, "append", e);
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean finish(String id) {
            File tmp = parts.remove(id);
            String[] m = meta.remove(id);
            if (tmp == null || m == null) return false;
            try {
                Uri saved = saveToDownloads(tmp, m[0], m[1]);
                runOnUiThread(() -> afterSave(saved, m[0], m[1]));
                return true;
            } catch (IOException e) {
                Log.e(TAG, "finish", e);
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Couldn't save " + m[0], Toast.LENGTH_LONG).show());
                return false;
            } finally {
                tmp.delete();
            }
        }
    }

    private static String safeName(String name) {
        String n = name == null || name.trim().isEmpty() ? "HSE_Audit_file" : name.trim();
        return n.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static String guessMime(String name) {
        String n = name == null ? "" : name.toLowerCase();
        if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    private Uri saveToDownloads(File src, String name, String mime) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = getContentResolver();
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/HSE Audit");
            cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new IOException("MediaStore insert failed");
            try (OutputStream out = cr.openOutputStream(uri); InputStream in = new FileInputStream(src)) {
                if (out == null) throw new IOException("No output stream");
                copy(in, out);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            cr.update(uri, done, null, null);
            return uri;
        }
        File dir = new File(getExternalFilesDir(null), "Download");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("No download folder");
        File dest = new File(dir, name);
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dest)) {
            copy(in, out);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".files", dest);
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private void afterSave(Uri uri, String name, String mime) {
        Toast.makeText(this, "Saved to Downloads: " + name, Toast.LENGTH_LONG).show();
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mime);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivity(Intent.createChooser(view, "Open " + name));
        } catch (ActivityNotFoundException e) {
            Log.i(TAG, "No app to open " + mime);
        }
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void onBackPressed() {
        if (showingOffline) {
            showingOffline = false;
            web.loadUrl(HOME);
            return;
        }
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }
}
