// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

let mediaRecorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

async function startRecording() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const buf = Buffer.from(await blob.arrayBuffer());
    await ipcRenderer.invoke("rec:save-file", buf);
  };

  mediaRecorder.start();
}

async function stopRecording() {
  mediaRecorder?.stop();
  mediaRecorder = null;
}

contextBridge.exposeInMainWorld("recorder", {
  listSources: () => ipcRenderer.invoke("rec:list-sources"),
  chooseSource: (id: string) => ipcRenderer.invoke("rec:choose-source", id),
  start: () => startRecording(),
  stop: () => stopRecording(),
});
