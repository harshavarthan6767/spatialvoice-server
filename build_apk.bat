@echo off
set JAVA_HOME=d:\samsung\jdk17\jdk-17.0.11+9
set ANDROID_SDK_ROOT=d:\samsung\android-sdk
set ANDROID_HOME=d:\samsung\android-sdk
set GRADLE_HOME=d:\samsung\gradle\gradle-8.9
set PATH=%JAVA_HOME%\bin;%ANDROID_SDK_ROOT%\cmdline-tools\latest\cmdline-tools\bin;%ANDROID_SDK_ROOT%\platform-tools;%GRADLE_HOME%\bin;%PATH%

echo ============================================
echo  Installing Android SDK components...
echo ============================================
echo y | sdkmanager --sdk_root=%ANDROID_SDK_ROOT% "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo.
echo ============================================
echo  Building debug APK...
echo ============================================
cd /d "d:\samsung data sets\spatialvoice-demo\android"
gradlew.bat assembleDebug

echo.
echo ============================================
echo  APK built! Location:
echo  d:\samsung data sets\spatialvoice-demo\android\app\build\outputs\apk\debug\app-debug.apk
echo ============================================
pause
