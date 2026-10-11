cmake_minimum_required(VERSION 3.22.1)
project(exovp9alpha)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find Android log library
find_library(log-lib log)
find_library(android-lib android)

# Prebuilt FFmpeg libraries path (copied from webmvp9alphaplayer)
set(FFMPEG_DIR ${CMAKE_SOURCE_DIR}/../prebuilt/${ANDROID_ABI})
set(FFMPEG_INCLUDE_DIR ${CMAKE_SOURCE_DIR}/../prebuilt/include)

# Add FFmpeg libraries as imported targets
add_library(avformat STATIC IMPORTED)
set_target_properties(avformat PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavformat.a)

add_library(avcodec STATIC IMPORTED)
set_target_properties(avcodec PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavcodec.a)

add_library(avutil STATIC IMPORTED)
set_target_properties(avutil PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libavutil.a)

add_library(swscale STATIC IMPORTED)
set_target_properties(swscale PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libswscale.a)

add_library(swresample STATIC IMPORTED)
set_target_properties(swresample PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libswresample.a)

add_library(vpx STATIC IMPORTED)
set_target_properties(vpx PROPERTIES IMPORTED_LOCATION ${FFMPEG_DIR}/lib/libvpx.a)

# Main JNI library
add_library(
    exovp9alpha
    SHARED
    exo_vp9_alpha_jni.cc
)

target_include_directories(
    exovp9alpha
    PRIVATE
    ${FFMPEG_INCLUDE_DIR}
)

# Link libraries - order matters for static linking!
target_link_libraries(
    exovp9alpha
    ${android-lib}
    ${log-lib}
    avformat
    avcodec
    swscale
    swresample
    avutil
    vpx
    z
    m
)
