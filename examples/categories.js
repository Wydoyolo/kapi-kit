import { KickApiClient } from 'kapi-kit';

const client = new KickApiClient({ accessToken: 'YOUR_ACCESS_TOKEN' });

const categories = await client.searchCategories({ query: 'music' });
console.log('Search results:', categories);

if (Array.isArray(categories) && categories.length > 0) {
  const category = await client.getCategoryById(categories[0].id);
  console.log('Category details:', category);
}
