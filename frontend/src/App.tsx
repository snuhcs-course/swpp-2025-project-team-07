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
