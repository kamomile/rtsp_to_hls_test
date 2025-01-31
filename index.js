const express = require("express");
const cors = require('cors');
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;

// HLS 스트림 저장 디렉토리
const STREAM_DIR = path.join(__dirname, "streams");
if (!fs.existsSync(STREAM_DIR)) {
  fs.mkdirSync(STREAM_DIR, { recursive: true });
}

app.use(express.json()); // JSON 요청 지원
app.use(cors());

// RTSP를 HLS로 변환하는 함수
function startHLSStream(rtspUrl, streamId, callback) {
  const streamPath = path.join(STREAM_DIR, streamId);
  if (!fs.existsSync(streamPath)) {
    fs.mkdirSync(streamPath, { recursive: true });
  }

  const playlistFile = path.join(streamPath, "index.m3u8");

//   const ffmpegProcess = spawn("./ffmpeg/ffmpeg.exe", [
//     "-hwaccel", "cuda",  // GPU 가속 사용
//     "-i", rtspUrl,
//     "-c:v", "h264_nvenc", // NVIDIA GPU 인코딩
//     "-preset", "fast",  // 인코딩 속도/품질 설정
//     "-c:a", "aac",
//     "-strict", "experimental",
//     "-f", "hls",
//     "-hls_time", "4",
//     "-hls_list_size", "5",
//     // "-hls_flags", "delete_segments",
//     "-hls_segment_filename", path.join(streamPath, "segment_%03d.ts"),
//     playlistFile,
//   ]);
  const ffmpegProcess = spawn("./ffmpeg/bin/ffmpeg.exe", [
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
    console.log(`[FFmpeg ${streamId}] 종료 (코드: ${code})`);
  });

  // 파일이 생성되었는지 감지한 후 콜백 실행
  const watcher = fs.watch(streamPath, (eventType, filename) => {
    if (filename === "index.m3u8" && fs.existsSync(playlistFile)) {
      watcher.close();
      callback(`/streams/${streamId}/index.m3u8`);
    }
  });

  return ffmpegProcess;
}

// 클라이언트가 RTSP URL을 요청하면 변환 후 주소 반환
app.post("/start-stream", (req, res) => {
  const { rtspUrl } = req.body;
  if (!rtspUrl) {
    return res.status(400).send({ error: "RTSP URL이 필요합니다." });
  }

  const streamId = `stream_${Date.now()}`;

  startHLSStream(rtspUrl, streamId, (hlsUrl) => {
    res.json({ hlsUrl });
  });
});

// 정적 파일 제공 (HLS 스트림)
app.use("/streams", express.static(STREAM_DIR));

// 서버 실행
app.listen(PORT, () => {
  console.log(`서버가 실행 중: http://localhost:${PORT}`);
});
