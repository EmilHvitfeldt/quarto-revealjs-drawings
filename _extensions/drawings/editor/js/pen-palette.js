// Color choices for the pen: one row of the Flexoki palette (https://github.com/kepano/flexoki),
// the 300 shade of gray and each of the 8 hues.
// Classic script: shares one global scope with the other files.
const penColors = [
  ["Gray 300", "B7B5AC"],
  ["Red 300", "E8705F"],
  ["Orange 300", "EC8B49"],
  ["Yellow 300", "DFB431"],
  ["Green 300", "A0AF54"],
  ["Cyan 300", "5ABDAC"],
  ["Blue 300", "66A0C8"],
  ["Purple 300", "A699D0"],
  ["Magenta 300", "E47DA8"],
].map(([name, hex]) => {
  const value = parseInt(hex, 16);
  return { name, r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
});
