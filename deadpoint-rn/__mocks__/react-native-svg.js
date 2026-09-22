/** Jest mock for 'react-native-svg', mapped in jest.config.js. Same
    reasoning as the other mocks in this directory: the real package
    reaches into react-native's own `Touchable` (undefined under the
    react-native mock next door), so importing it throws "Cannot
    destructure property 'Mixin'" before a single test runs.

    Added when CardHeader.tsx and ExerciseRow.tsx swapped their Unicode
    glyph / stacked-View icons for drawn paths. Both are imported by
    __tests__/dailyCard.test.ts and __tests__/cardHeaderDate.test.ts,
    neither of which renders an icon — they call CardBody/formatHeaderDate
    and inspect the returned element tree. So these need to be real
    components only in the sense that React can put them in a tree: each
    returns a plain host element carrying its own props, which keeps a
    future icon-level assertion possible without a rewrite. Nothing here
    draws anything; there is no SVG renderer under a node test env. */
const React = require('react');

function stub(displayName) {
  const Component = ({ children, ...props }) =>
    React.createElement(displayName, props, children ?? null);
  Component.displayName = displayName;
  return Component;
}

const Svg = stub('Svg');

module.exports = Svg;
module.exports.default = Svg;
module.exports.Svg = Svg;
module.exports.Circle = stub('Circle');
module.exports.Ellipse = stub('Ellipse');
module.exports.G = stub('G');
module.exports.Line = stub('Line');
module.exports.Path = stub('Path');
module.exports.Polygon = stub('Polygon');
module.exports.Polyline = stub('Polyline');
module.exports.Rect = stub('Rect');
module.exports.Text = stub('SvgText');
