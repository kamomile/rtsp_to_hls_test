const express = require("express");
const cors = require('cors');
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const chokidar = require('chokidar');


const app = express();
const PORT = 3000;

// HLS 스트림 디렉토리
const STREAM_DIR = path.join(__dirname, "streams");

// JSON 요청 지원
app.use(express.json());
app.use(cors());

// 스트림 디렉토리 생성
if (!fs.existsSync(STREAM_DIR)) {
  fs.mkdirSync(STREAM_DIR, { recursive: true });
}

// RTSP를 HLS로 변환
function startHLSStream(rtspUrl, streamId) {
  const streamPath = path.join(STREAM_DIR, streamId);
  if (!fs.existsSync(streamPath)) {
    fs.mkdirSync(streamPath, { recursive: true });
  }

  const ffmpegProcess = spawn("./ffmpeg/ffmpeg.exe", [
    "-i", rtspUrl,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-c:a", "aac",
    "-strict", "experimental",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "5",
    //"-hls_flags", "delete_segments",
    "-hls_segment_filename", path.join(streamPath, "segment_%03d.ts"),
    path.join(streamPath, "index.m3u8"),
  ]);

  ffmpegProcess.stderr.on("data", (data) => {
    console.log(`[FFmpeg ${streamId}]: ${data}`);
  });

  ffmpegProcess.on("close", (code) => {
    console.log(`[FFmpeg ${streamId}] exited with code ${code}`);
  });

  return { ffmpegProcess, streamPath };
}

// RTSP URL을 받아 스트림 시작
app.post("/start-stream", (req, res) => {
  const { rtspUrl } = req.body;
  if (!rtspUrl) {
    return res.status(400).send({ error: "RTSP URL is required" });
  }

  // const streamId = `stream_${Date.now()}`;
  // startHLSStream(rtspUrl, streamId);
  const { streamPath } = startHLSStream(rtspUrl, '');

  const checkFile = ` ${streamPath}/index.m3u8`
  console.log(checkFile)
  const watcher = chokidar.watch(checkFile, {
    persistent: true, // 프로그램이 계속 실행되도록 유지
    ignoreInitial: true, // 기존 파일 감지를 방지하고 새 파일만 감지
  });
  watcher.on('add', (filePath) => {
    console.log(`✅ 특정 파일 생성됨: ${filePath}`);
    res.send({ hlsUrl: `/streams/index.m3u8`, checkFile });
    watcher.close(); // 감지 후 감시 종료 (필요 시 유지 가능)
  });

  // fs.watchFile(checkFile, () => (curr, prev) => {
  //   res.send({ hlsUrl: `/streams/index.m3u8`, checkFile });
  // });

  // res.send({ hlsUrl: `/streams/${streamId}/index.m3u8` });
  // res.send({ hlsUrl: `/streams/index.m3u8`, checkFile });
});

// 정적 파일 제공
app.use("/streams", express.static(STREAM_DIR));

// 서버 시작
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
