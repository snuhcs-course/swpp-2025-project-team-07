import { AppContainer } from "./components/AppContainer";
import { RecorderProvider } from "./recording/provider";

export default function App() {
  return (
    <RecorderProvider>
      <div className="size-full dark">
        <AppContainer />
      </div>
    </RecorderProvider>
  );
}

const handleVideoEmbedding = async (videoBlob: Blob) => {
  try {
    const videoBuffer = await videoBlob.arrayBuffer();

    const embeddingResult = await window.electronAPI.runVideoEmbedding(Buffer.from(videoBuffer));

    console.log('Embedding result received in UI:', embeddingResult);

  } catch (error) {
    console.error('Failed to get video embedding:', error);
  }
};