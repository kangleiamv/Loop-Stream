import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { Toaster } from 'react-hot-toast';
import Head from 'next/head';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>LOOP STREAM by CMAISNAM - Professional 24/7 Streaming Platform</title>
        <meta name="description" content="LOOP STREAM by CMAISNAM - Professional 24/7 continuous streaming application" />
        <meta name="author" content="CMAISNAM" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Component {...pageProps} />
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#262626',
            color: '#fafafa',
            border: '1px solid #404040',
          },
        }}
      />
    </>
  );
}