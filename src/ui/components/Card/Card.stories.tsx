import * as React from 'react';
import { Card } from './index';
import { Button } from '../Button';

export const CardExamples = () => {
  const [selectedCard, setSelectedCard] = React.useState<string | null>(null);

  return (
    <div style={{ padding: '20px', fontFamily: 'var(--vscode-font-family)' }}>
      <h2>Card Component Examples</h2>
      
      {/* Basic Cards */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Basic Cards</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <Card>
            <Card.Title>Default Card</Card.Title>
            <Card.Body>
              This is a basic card with default styling. It provides a simple container for content.
            </Card.Body>
          </Card>

          <Card variant="bordered">
            <Card.Title>Bordered Card</Card.Title>
            <Card.Body>
              This card has a visible border. Useful for creating distinct sections.
            </Card.Body>
          </Card>

          <Card variant="elevated">
            <Card.Title>Elevated Card</Card.Title>
            <Card.Body>
              This card has a shadow effect that increases on hover, creating a sense of depth.
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* Card with Components */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Card with Components</h3>
        <div style={{ maxWidth: '600px' }}>
          <Card variant="bordered">
            <Card.Header>
              <Card.Title>Card Title</Card.Title>
              <Card.Subtitle>This is a subtitle that provides additional context</Card.Subtitle>
            </Card.Header>
            <Card.Body>
              <p>The card body can contain any content. This example shows how to use the various card sub-components together.</p>
              <p>You can add multiple paragraphs, lists, or any other HTML elements.</p>
            </Card.Body>
            <Card.Footer>
              <Card.Actions className="right">
                <Button variant="secondary">Cancel</Button>
                <Button variant="primary">Confirm</Button>
              </Card.Actions>
            </Card.Footer>
          </Card>
        </div>
      </section>

      {/* Padding Variants */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Padding Variants</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <Card padding="none" variant="bordered">
            <div style={{ padding: '8px' }}>No padding</div>
          </Card>
          <Card padding="sm" variant="bordered">
            Small padding
          </Card>
          <Card padding="md" variant="bordered">
            Medium padding (default)
          </Card>
          <Card padding="lg" variant="bordered">
            Large padding
          </Card>
        </div>
      </section>

      {/* Interactive Cards */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Interactive Cards</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <Card hoverable variant="bordered">
            <Card.Title>Hoverable Card</Card.Title>
            <Card.Body>
              This card changes appearance on hover but is not clickable.
            </Card.Body>
          </Card>

          <Card 
            clickable 
            variant="bordered"
            onClick={() => console.log('Card clicked!')}
          >
            <Card.Title>Clickable Card</Card.Title>
            <Card.Body>
              This card is clickable and shows a pointer cursor. Click to see console output.
            </Card.Body>
          </Card>

          <Card 
            clickable 
            selected={selectedCard === 'card1'}
            variant="bordered"
            onClick={() => setSelectedCard(selectedCard === 'card1' ? null : 'card1')}
          >
            <Card.Title>Selectable Card</Card.Title>
            <Card.Body>
              Click this card to toggle its selected state.
            </Card.Body>
          </Card>
        </div>
      </section>

      {/* Full Width Card */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Full Width Card</h3>
        <Card fullWidth variant="bordered">
          <Card.Header>
            <Card.Title>Full Width Card</Card.Title>
            <Card.Subtitle>This card spans the full width of its container</Card.Subtitle>
          </Card.Header>
          <Card.Body>
            Full width cards are useful for creating prominent sections or when you need content to span the entire available width.
          </Card.Body>
        </Card>
      </section>

      {/* Complex Card Example */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Complex Card Example</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          <Card variant="elevated" hoverable>
            <Card.Header>
              <Card.Title>Project Status</Card.Title>
              <Card.Subtitle>Last updated: 2 hours ago</Card.Subtitle>
            </Card.Header>
            <Card.Body>
              <div style={{ marginBottom: '16px' }}>
                <strong>Progress:</strong> 75% Complete
              </div>
              <div style={{ marginBottom: '16px' }}>
                <strong>Tasks:</strong> 15 / 20 completed
              </div>
              <div>
                <strong>Next Milestone:</strong> Beta Release
              </div>
            </Card.Body>
            <Card.Footer>
              <Card.Actions className="space-between">
                <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                  Due in 5 days
                </span>
                <Button size="sm">View Details</Button>
              </Card.Actions>
            </Card.Footer>
          </Card>

          <Card variant="elevated" hoverable>
            <Card.Header>
              <Card.Title>Team Updates</Card.Title>
              <Card.Subtitle>3 new messages</Card.Subtitle>
            </Card.Header>
            <Card.Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '8px', backgroundColor: 'var(--vscode-editor-background)', borderRadius: '4px' }}>
                  <strong>Alice:</strong> Completed API integration
                </div>
                <div style={{ padding: '8px', backgroundColor: 'var(--vscode-editor-background)', borderRadius: '4px' }}>
                  <strong>Bob:</strong> Fixed critical bug in auth flow
                </div>
                <div style={{ padding: '8px', backgroundColor: 'var(--vscode-editor-background)', borderRadius: '4px' }}>
                  <strong>Carol:</strong> Updated documentation
                </div>
              </div>
            </Card.Body>
            <Card.Footer>
              <Card.Actions className="center">
                <Button variant="tertiary" fullWidth>View All Messages</Button>
              </Card.Actions>
            </Card.Footer>
          </Card>
        </div>
      </section>

      {/* List of Cards */}
      <section style={{ marginBottom: '32px' }}>
        <h3>Card List</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '600px' }}>
          {['Item 1', 'Item 2', 'Item 3'].map((item, index) => (
            <Card
              key={item}
              clickable
              variant="bordered"
              selected={selectedCard === `list-${index}`}
              onClick={() => setSelectedCard(`list-${index}`)}
              padding="sm"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{item}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                    Click to select this item
                  </div>
                </div>
                <span>{selectedCard === `list-${index}` ? '✓' : ''}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};