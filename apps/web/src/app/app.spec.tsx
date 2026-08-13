import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from './app';

describe('App', () => {
  it('should render the shell heading', () => {
    const { getByRole } = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(getByRole('heading', { name: 'monorepo-starter' })).toBeInTheDocument();
  });
});
