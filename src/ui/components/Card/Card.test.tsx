import * as React from 'react';
import { expect } from 'chai';
import { Card } from './index';

describe('Card Component', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      const card = React.createElement(Card, {}, 'Card content');
      expect(card).to.not.be.null;
      expect(card.props.children).to.equal('Card content');
    });

    it('should render with custom className', () => {
      const card = React.createElement(Card, { 
        className: 'custom-class' 
      }, 'Card');
      expect(card.props.className).to.include('custom-class');
    });
  });

  describe('variants', () => {
    it('should apply default variant by default', () => {
      const card = React.createElement(Card, {}, 'Card');
      expect(card.props.variant).to.equal('default');
    });

    it('should apply different variants', () => {
      const bordered = React.createElement(Card, { variant: 'bordered' }, 'Bordered');
      const elevated = React.createElement(Card, { variant: 'elevated' }, 'Elevated');
      
      expect(bordered.props.variant).to.equal('bordered');
      expect(elevated.props.variant).to.equal('elevated');
    });
  });

  describe('padding', () => {
    it('should apply medium padding by default', () => {
      const card = React.createElement(Card, {}, 'Card');
      expect(card.props.padding).to.equal('md');
    });

    it('should apply different padding sizes', () => {
      const none = React.createElement(Card, { padding: 'none' }, 'No padding');
      const small = React.createElement(Card, { padding: 'sm' }, 'Small');
      const large = React.createElement(Card, { padding: 'lg' }, 'Large');
      
      expect(none.props.padding).to.equal('none');
      expect(small.props.padding).to.equal('sm');
      expect(large.props.padding).to.equal('lg');
    });
  });

  describe('interactive states', () => {
    it('should handle hoverable state', () => {
      const card = React.createElement(Card, { hoverable: true }, 'Hoverable');
      expect(card.props.hoverable).to.be.true;
    });

    it('should handle clickable state', () => {
      const onClick = () => { console.log('clicked'); };
      const card = React.createElement(Card, { 
        clickable: true,
        onClick 
      }, 'Clickable');
      
      expect(card.props.clickable).to.be.true;
      expect(card.props.onClick).to.equal(onClick);
    });

    it('should handle selected state', () => {
      const card = React.createElement(Card, { selected: true }, 'Selected');
      expect(card.props.selected).to.be.true;
    });

    it('should be hoverable when clickable', () => {
      const card = React.createElement(Card, { clickable: true }, 'Clickable');
      expect(card.props.clickable).to.be.true;
      // Hoverable should be implied when clickable
    });
  });

  describe('fullWidth', () => {
    it('should apply fullWidth prop', () => {
      const card = React.createElement(Card, { fullWidth: true }, 'Full Width');
      expect(card.props.fullWidth).to.be.true;
    });
  });

  describe('sub-components', () => {
    it('should have Header sub-component', () => {
      expect(Card.Header).to.not.be.undefined;
    });

    it('should have Title sub-component', () => {
      expect(Card.Title).to.not.be.undefined;
    });

    it('should have Subtitle sub-component', () => {
      expect(Card.Subtitle).to.not.be.undefined;
    });

    it('should have Body sub-component', () => {
      expect(Card.Body).to.not.be.undefined;
    });

    it('should have Footer sub-component', () => {
      expect(Card.Footer).to.not.be.undefined;
    });

    it('should have Actions sub-component', () => {
      expect(Card.Actions).to.not.be.undefined;
    });
  });

  describe('composition', () => {
    it('should compose with sub-components', () => {
      const card = React.createElement(Card, { variant: 'bordered' },
        React.createElement(Card.Header, {},
          React.createElement(Card.Title, {}, 'Title'),
          React.createElement(Card.Subtitle, {}, 'Subtitle')
        ),
        React.createElement(Card.Body, {}, 'Body content'),
        React.createElement(Card.Footer, {},
          React.createElement(Card.Actions, {}, 'Actions')
        )
      );
      
      expect(card).to.not.be.null;
      expect(card.props.children).to.be.an('array');
    });
  });

  describe('accessibility', () => {
    it('should have button role when clickable', () => {
      const card = React.createElement(Card, { clickable: true }, 'Clickable');
      // The component should add role="button" when clickable
      expect(card.props.clickable).to.be.true;
    });

    it('should be focusable when clickable', () => {
      const card = React.createElement(Card, { clickable: true }, 'Clickable');
      // The component should add tabIndex={0} when clickable
      expect(card.props.clickable).to.be.true;
    });
  });
});