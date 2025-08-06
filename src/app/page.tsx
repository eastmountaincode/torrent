import VideoDisplay from "./components/VideoDisplay";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-4xl font-bold">Hello World!</h1>
      <VideoDisplay />
    </div>
  );
}
