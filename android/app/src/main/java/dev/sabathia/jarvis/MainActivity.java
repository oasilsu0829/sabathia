package dev.sabathia.jarvis;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

/** 홈 화면(런처)으로 자비스 웹앱을 띄우고, JS에서 다른 앱을 실행할 수 있게 한다. */
public class MainActivity extends Activity {
    private static final String HOME_URL = "https://sabathia.oasilsu0829.workers.dev/";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setBackgroundColor(0xFF000000);
        web.addJavascriptInterface(new Bridge(), "Jarvis");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOME_URL.startsWith(u.getScheme() + "://" + u.getHost())) return false;
                openUri(u.toString());
                return true;
            }
        });
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl(HOME_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.evaluateJavascript("window.onJarvisResume && window.onJarvisResume()", null);
    }

    // 홈 버튼을 다시 누르면 맨 위로
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        web.evaluateJavascript("window.onJarvisHome && window.onJarvisHome()", null);
    }

    // 런처이므로 뒤로가기로 종료되지 않게
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onJarvisBack && window.onJarvisBack()", null);
    }

    private void openUri(String uri) {
        try {
            Intent i = uri.startsWith("intent:")
                    ? Intent.parseUri(uri, Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private class Bridge {
        @JavascriptInterface
        public boolean launch(String pkg) {
            Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            return true;
        }

        @JavascriptInterface
        public void open(String uri) {
            runOnUiThread(() -> openUri(uri));
        }

        @JavascriptInterface
        public String apps() {
            PackageManager pm = getPackageManager();
            Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
            JSONArray arr = new JSONArray();
            for (ResolveInfo r : list) {
                String pkg = r.activityInfo.packageName;
                if (pkg.equals(getPackageName())) continue;
                try {
                    arr.put(new JSONObject().put("name", r.loadLabel(pm).toString()).put("pkg", pkg));
                } catch (Exception ignored) {
                }
            }
            return arr.toString();
        }

        @JavascriptInterface
        public void settings() {
            runOnUiThread(() -> startActivity(new Intent(android.provider.Settings.ACTION_HOME_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
        }
    }
}
