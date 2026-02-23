module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
      },
    ],
    [
      '@babel/preset-react',
      {
        runtime: 'automatic',
      },
    ],
    [
      '@babel/preset-typescript',
      {
        allowDeclareFields: true,
      },
    ],
  ],
  plugins: [
    '@babel/plugin-proposal-class-static-block',
    [
      '@babel/plugin-proposal-decorators',
      { version: '2023-01' },
    ],
    [
      '@babel/plugin-proposal-class-properties',
      { loose: false },
    ],
  ],
  assumptions: {
    setPublicClassFields: false,
  },
};
