export default {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    { name: 'preset-default' },
    // Inlined SVGs share one document; scope gradient/clip ids to the file.
    { name: 'prefixIds', params: { prefix: (node, info) => info.path.split('/').pop().replace('.svg', '') } },
  ],
};
