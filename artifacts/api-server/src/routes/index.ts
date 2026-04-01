import { Router, type IRouter } from "express";
import healthRouter from "./health";
import artworksRouter from "./artworks";
import checkoutRouter from "./checkout";
import inquireRouter from "./inquire";
import merchRouter from "./merch";
import merchCheckoutRouter from "./merch-checkout";

const router: IRouter = Router();

router.use(healthRouter);
router.use(artworksRouter);
router.use(checkoutRouter);
router.use(inquireRouter);
router.use(merchRouter);
router.use(merchCheckoutRouter);

export default router;
