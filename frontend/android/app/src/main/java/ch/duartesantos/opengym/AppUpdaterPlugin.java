package ch.duartesantos.opengym;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;

/**
 * In-App Auto Updater native plugin for Android.
 * Handles triggering the package installer via FileProvider and Intent.ACTION_VIEW.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod
    public void installApk(PluginCall call) {
        String fileName = call.getString("fileName", "opengym-update.apk");
        String filePath = call.getString("filePath");
        String expectedHash = call.getString("sha256");

        File file;
        if (filePath != null && !filePath.isEmpty()) {
            file = new File(filePath);
        } else {
            file = new File(getContext().getCacheDir(), fileName);
        }

        if (!file.exists()) {
            call.reject("APK file not found: " + file.getAbsolutePath());
            return;
        }

        // Optional SHA-256 integrity verification if hash is provided
        if (expectedHash != null && !expectedHash.trim().isEmpty() && expectedHash.length() == 64) {
            try {
                String actualHash = sha256(file);
                if (!expectedHash.equalsIgnoreCase(actualHash)) {
                    file.delete();
                    call.reject("SHA-256 mismatch: the download may be corrupted or tampered with");
                    return;
                }
            } catch (Exception e) {
                call.reject("Could not check download hash: " + e.getMessage());
                return;
            }
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to launch package installer: " + e.getMessage());
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[1 << 16];
        try (InputStream in = new FileInputStream(file)) {
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format("%02x", b));
        return hex.toString();
    }
}
