import { WorkflowContext, Workflow, HandlerContext, PostApi, ArgOptional } from '@dbos-inc/dbos-sdk';
import { ShopUtilities } from './utilities';
import { Frontend } from './frontend';

export { ShopUtilities };
export { Frontend };

export const PAYMENT_TOPIC = "payment";
export const PAYMENT_URL_EVENT = "payment_url";
export const ORDER_URL_EVENT = "order_url";

export class Shop {

  @PostApi('/checkout/:key?')
  static async webCheckout(ctxt: HandlerContext, @ArgOptional key: string): Promise<string> {
    // Start the workflow (below): this gives us the handle immediately and continues in background
    const handle = await ctxt.startWorkflow(Shop, key).paymentWorkflow();

    // Wait for the workflow to create the payment URL; return that to the user
    const paymentURL = await ctxt.getEvent<string>(handle.getWorkflowUUID(), PAYMENT_URL_EVENT);
    if (paymentURL === null) {
      ctxt.logger.error("workflow failed");
      return "/error";
    }
    return paymentURL;
  }

  @Workflow()
  static async paymentWorkflow(ctxt: WorkflowContext): Promise<void> {
    // Attempt to update the inventory. Signal the handler if it fails.
    try {
      await ctxt.invoke(ShopUtilities).subtractInventory();
    } catch (error) {
      ctxt.logger.error("Failed to update inventory");
      await ctxt.setEvent(PAYMENT_URL_EVENT, null);
      return;
    }
    const orderID = await ctxt.invoke(ShopUtilities).createOrder();

    // Provide the paymentURL back to webCheckout (above)
    await ctxt.setEvent(PAYMENT_URL_EVENT, `/payment/${ctxt.workflowUUID}`);

    // Wait for a payment notification from paymentWebhook (below)
    // This simulates a communicator waiting on a payment processor
    // If the timeout expires (seconds), this returns null
    // and the order is cancelled
    const notification = await ctxt.recv<string>(PAYMENT_TOPIC, 120);

    // If the money is good - fulfill the order. Else, cancel:
    if (notification && notification === 'paid') {
      ctxt.logger.info(`Payment successful!`);
      await ctxt.invoke(ShopUtilities).fulfillOrder(orderID);
    } else {
      ctxt.logger.warn(`Payment failed...`);
      await ctxt.invoke(ShopUtilities).errorOrder(orderID);
      await ctxt.invoke(ShopUtilities).undoSubtractInventory();
    }

    // Return the finished order ID back to paymentWebhook (below)
    await ctxt.setEvent(ORDER_URL_EVENT, `/order/${orderID}`);
  }

  @PostApi('/payment_webhook/:key/:status')
  static async paymentWebhook(ctxt: HandlerContext, key: string, status: string): Promise<string> {

    // Send payment status to the workflow above
    await ctxt.send(key, status, PAYMENT_TOPIC);

    // Wait for workflow to give us the order URL
    const orderURL = await ctxt.getEvent<string>(key, ORDER_URL_EVENT);
    if (orderURL === null) {
      ctxt.logger.error("retreving order URL failed");
      return "/error";
    }

    // Return the order status URL to the client
    return orderURL;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  @PostApi('/crash_application')
  static async crashApplication(_ctxt: HandlerContext) {

    // For testing and demo purposes :) 
    process.exit(1);
  }
}


