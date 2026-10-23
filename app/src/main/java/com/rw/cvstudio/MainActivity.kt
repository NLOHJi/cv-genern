package com.rw.cvstudio

import android.annotation.SuppressLint
import android.os.Bundle
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        
        // Enable local storage and JS
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true
        
        // Crucial for fetching from Cloudflare without CORS errors
        webView.settings.allowUniversalAccessFromFileURLs = true

        // Intercept Print Command
        webView.addJavascriptInterface(WebAppInterface(), "AndroidPrint")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return false
            }
        }

        setContentView(webView)
        
        // Load the app
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    // Handle Back Button
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    // This class receives the HTML from JavaScript and prints it
    inner class WebAppInterface {
        @JavascriptInterface
        fun printPage(htmlContent: String) {
            runOnUiThread {
                val printWebView = WebView(this@MainActivity)
                printWebView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        val printManager = getSystemService(PRINT_SERVICE) as PrintManager
                        val printAdapter = view!!.createPrintDocumentAdapter("CV_Document")
                        printManager.print("CV Document", printAdapter, PrintAttributes.Builder().build())
                    }
                }
                printWebView.loadDataWithBaseURL(null, htmlContent, "text/html", "UTF-8", null)
            }
        }
    }
}