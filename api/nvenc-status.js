export default function handler(req, res) {
  res.status(200).json({
    available: false,
    cloud: true,
    message: 'Running on live cloud host. Pure client-side WebCodecs GPU and WebAssembly active.',
  });
}
