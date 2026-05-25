import { getTemplate } from "./helpers";

test("snapshot", () => {
  const template = getTemplate();
  expect(template.toJSON()).toMatchSnapshot();
});
