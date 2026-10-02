export default function sitemap() {
  const base = 'https://getfieldcore.com';
  const now = new Date();

  const publicRoutes = [
    { path: '/',          priority: 1.0, changeFrequency: 'weekly' },
    { path: '/features',  priority: 0.9, changeFrequency: 'monthly' },
    { path: '/pricing',   priority: 0.9, changeFrequency: 'monthly' },
    { path: '/verticals', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/compare',   priority: 0.8, changeFrequency: 'monthly' },
    { path: '/updates',   priority: 0.7, changeFrequency: 'weekly' },
    { path: '/about',     priority: 0.7, changeFrequency: 'monthly' },
    { path: '/blog',      priority: 0.7, changeFrequency: 'weekly' },
    { path: '/careers',   priority: 0.6, changeFrequency: 'weekly' },
    { path: '/partners',  priority: 0.6, changeFrequency: 'monthly' },
    { path: '/contact',   priority: 0.6, changeFrequency: 'yearly' },
    { path: '/press',     priority: 0.5, changeFrequency: 'monthly' },
    { path: '/faq',       priority: 0.7, changeFrequency: 'monthly' },
    { path: '/terms',     priority: 0.4, changeFrequency: 'yearly' },
    { path: '/privacy',   priority: 0.4, changeFrequency: 'yearly' },
    { path: '/sms-terms', priority: 0.4, changeFrequency: 'yearly' },
  ];

  return publicRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
