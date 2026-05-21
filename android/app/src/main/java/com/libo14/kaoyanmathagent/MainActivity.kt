package com.libo14.kaoyanmathagent

import android.Manifest
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.libo14.kaoyanmathagent.ui.KaoyanMathApp
import com.libo14.kaoyanmathagent.ui.AppViewModel
import java.io.File

class MainActivity : ComponentActivity() {
    private val viewModel: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val state by viewModel.state.collectAsStateWithLifecycle()
            CameraAndPickerHost(
                content = { openCamera, openGallery, openImport ->
                    KaoyanMathApp(
                        state = state,
                        actions = viewModel,
                        openCamera = openCamera,
                        openGallery = openGallery,
                        openImport = openImport
                    )
                },
                onImage = viewModel::setImage,
                onImport = viewModel::importFile
            )
        }
    }
}

@Composable
private fun CameraAndPickerHost(
    content: @Composable (() -> Unit, () -> Unit, () -> Unit) -> Unit,
    onImage: (Uri) -> Unit,
    onImport: (Uri) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    var pendingCameraLaunch by remember { mutableStateOf<(() -> Unit)?>(null) }
    val gallery = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> if (uri != null) onImage(uri) }
    val camera = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { ok -> if (ok) cameraUri?.let(onImage) }
    val cameraPermission = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) {
            pendingCameraLaunch?.invoke()
        } else {
            Toast.makeText(context, "需要相机权限才能拍照识题", Toast.LENGTH_SHORT).show()
        }
    }
    val importer = androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri -> if (uri != null) onImport(uri) }

    content(
        {
            val launchCamera = {
                val dir = File(context.cacheDir, "camera").also { it.mkdirs() }
                val file = File(dir, "question_${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                cameraUri = uri
                camera.launch(uri)
            }
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                launchCamera()
            } else {
                pendingCameraLaunch = launchCamera
                cameraPermission.launch(Manifest.permission.CAMERA)
            }
        },
        { gallery.launch("image/*") },
        { importer.launch(arrayOf("text/markdown", "text/plain", "application/json", "application/octet-stream")) }
    )
}
