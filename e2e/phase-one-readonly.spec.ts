import {test,expect} from "@playwright/test";

test("existing financial pages render without browser errors",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demopassword123");
  await page.getByRole("button",{name:"Log in"}).click();
  await page.waitForURL("**/dashboard");
  for(const path of ["/dashboard","/budget","/calendar","/loans-cards"]){
    const response=await page.goto(path);
    expect(response?.status(),path).toBe(200);
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page.locator("main")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
