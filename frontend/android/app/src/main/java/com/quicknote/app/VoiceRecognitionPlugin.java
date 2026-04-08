package com.quicknote.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import android.Manifest;
import androidx.activity.result.ActivityResult;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "VoiceRecognition",
    permissions = {
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        )
    }
)
public class VoiceRecognitionPlugin extends Plugin {

    private SpeechRecognizer speechRecognizer;
    private PluginCall activeCall;
    private AudioRecord audioRecord;
    private volatile boolean isCapturing = false;
    private Thread captureThread;

    // PCM 音频参数：16kHz, 16bit, 单声道
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int CHUNK_SIZE = 1280; // 每次发送1280字节 (40ms的音频)

    // ====== 原生 PCM 音频采集（用于讯飞 WebSocket）======

    @PluginMethod()
    public void startCapture(PluginCall call) {
        // 先检查权限
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "handleCapturePermResult");
            return;
        }
        doStartCapture(call);
    }

    @PermissionCallback
    private void handleCapturePermResult(PluginCall call) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            doStartCapture(call);
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "录音权限被拒绝，请在设置中允许");
            call.resolve(ret);
        }
    }

    private void doStartCapture(PluginCall call) {
        if (isCapturing) {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            return;
        }

        try {
            int bufferSize = Math.max(
                AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT),
                CHUNK_SIZE * 4
            );

            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "音频录制初始化失败");
                call.resolve(ret);
                return;
            }

            isCapturing = true;
            audioRecord.startRecording();

            // 后台线程持续读取音频数据
            captureThread = new Thread(() -> {
                byte[] buffer = new byte[CHUNK_SIZE];
                while (isCapturing) {
                    int read = audioRecord.read(buffer, 0, CHUNK_SIZE);
                    if (read > 0) {
                        // 将 PCM 数据通过事件发送给 JavaScript
                        String base64Data = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
                        JSObject event = new JSObject();
                        event.put("data", base64Data);
                        event.put("size", read);
                        notifyListeners("audioData", event);
                    }
                }
            });
            captureThread.start();

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);

        } catch (SecurityException e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "录音权限未授予: " + e.getMessage());
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "音频采集启动失败: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod()
    public void stopCapture(PluginCall call) {
        isCapturing = false;

        if (captureThread != null) {
            try {
                captureThread.join(1000);
            } catch (InterruptedException ignored) {}
            captureThread = null;
        }

        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception ignored) {}
            audioRecord = null;
        }

        // 通知 JavaScript 录音已停止
        JSObject event = new JSObject();
        event.put("stopped", true);
        notifyListeners("captureStop", event);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    // ====== 原有的语音识别方法（保留作为备用）======

    @PluginMethod()
    public void recognize(PluginCall call) {
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "handlePermResult");
            return;
        }
        doRecognize(call);
    }

    @PermissionCallback
    private void handlePermResult(PluginCall call) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            doRecognize(call);
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("text", "");
            ret.put("error", "录音权限被拒绝，请在设置中允许");
            call.resolve(ret);
        }
    }

    private void doRecognize(PluginCall call) {
        if (SpeechRecognizer.isRecognitionAvailable(getContext())) {
            useSpeechRecognizer(call);
            return;
        }

        Intent testIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        List<ResolveInfo> activities = getContext().getPackageManager()
            .queryIntentActivities(testIntent, 0);
        if (activities != null && !activities.isEmpty()) {
            useIntentRecognizer(call);
            return;
        }

        JSObject ret = new JSObject();
        ret.put("success", false);
        ret.put("text", "");
        ret.put("error", "设备没有可用的语音识别服务");
        call.resolve(ret);
    }

    private void useSpeechRecognizer(PluginCall call) {
        activeCall = call;
        getActivity().runOnUiThread(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.destroy();
                }
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                speechRecognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION);
                        JSObject ret = new JSObject();
                        if (matches != null && !matches.isEmpty()) {
                            ret.put("success", true);
                            ret.put("text", matches.get(0));
                        } else {
                            ret.put("success", false);
                            ret.put("text", "");
                        }
                        if (activeCall != null) {
                            activeCall.resolve(ret);
                            activeCall = null;
                        }
                    }

                    @Override
                    public void onError(int error) {
                        String msg;
                        switch (error) {
                            case SpeechRecognizer.ERROR_NO_MATCH: msg = "未识别到语音内容"; break;
                            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: msg = "语音超时，请重试"; break;
                            case SpeechRecognizer.ERROR_AUDIO: msg = "音频录制错误"; break;
                            case SpeechRecognizer.ERROR_NETWORK:
                            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: msg = "网络错误"; break;
                            default: msg = "语音识别错误(" + error + ")"; break;
                        }
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("text", "");
                        ret.put("error", msg);
                        if (activeCall != null) {
                            activeCall.resolve(ret);
                            activeCall = null;
                        }
                    }
                });

                String language = call.getString("language", "zh-CN");
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                speechRecognizer.startListening(intent);

            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("text", "");
                ret.put("error", "语音识别启动失败: " + e.getMessage());
                if (activeCall != null) {
                    activeCall.resolve(ret);
                    activeCall = null;
                }
            }
        });
    }

    private void useIntentRecognizer(PluginCall call) {
        try {
            String language = call.getString("language", "zh-CN");
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "请说话...");
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            startActivityForResult(call, intent, "onSpeechResult");
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("text", "");
            ret.put("error", "语音Activity启动失败: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @ActivityCallback
    private void onSpeechResult(PluginCall call, ActivityResult result) {
        JSObject ret = new JSObject();
        if (call == null) return;
        try {
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                ArrayList<String> matches = result.getData()
                    .getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (matches != null && !matches.isEmpty()) {
                    ret.put("success", true);
                    ret.put("text", matches.get(0));
                    call.resolve(ret);
                    return;
                }
            }
        } catch (Exception e) {}
        ret.put("success", false);
        ret.put("text", "");
        call.resolve(ret);
    }

    @PluginMethod()
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (speechRecognizer != null) {
                    speechRecognizer.stopListening();
                }
            } catch (Exception e) {}
        });
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        isCapturing = false;
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception ignored) {}
            audioRecord = null;
        }
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        super.handleOnDestroy();
    }
}
