import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR은 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작합니다.
// - PC 브라우저 테스트: `npm run dev` (http://localhost:5173)
// - 같은 Wi-Fi의 VR 헤드셋(Quest 등) 테스트: `npm run dev:https` → https://<PC IP>:5173
// - GitHub Pages 배포: base를 './'로 두어 /poject/ 하위 경로에서도 동작
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'https' ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
}));
