import './globals.css';

export const metadata = {
  title: 'Candidate Screening CRM',
  description: 'Apply for open roles and get screened by an AI voice agent.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
