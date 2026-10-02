export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/login'],
      },
    ],
    sitemap: 'https://getfieldcore.com/sitemap.xml',
  };
}
