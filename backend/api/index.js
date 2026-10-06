const app = require('../index');

module.exports = (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	const routedPath = url.searchParams.get('__vercel_path');
	if (routedPath !== null) {
		url.searchParams.delete('__vercel_path');
		url.pathname = `/${routedPath.replace(/^\/+/, '')}`;
		req.url = `${url.pathname}${url.search}`;
	} else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
		url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
		req.url = `${url.pathname}${url.search}`;
	}
	return app(req, res);
};
