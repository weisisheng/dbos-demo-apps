import { TransactionContext, HandlerContext, Transaction, GetApi, OrmEntities } from '@dbos-inc/dbos-sdk';
import { EntityManager } from "typeorm";
import { DBOSHello } from '../entities/DBOSHello';

@OrmEntities([DBOSHello])
export class Hello {

  @Transaction()
  static async helloTransaction (txnCtxt: TransactionContext<EntityManager>, name: string)  {
    const greeting = `Hello, ${name}!`;

    const p: EntityManager = txnCtxt.client as EntityManager;
    const g: DBOSHello = new DBOSHello();
    g.greeting = greeting;
    const res = await p.save(g);
    return `Greeting ${res.greeting_id}: ${greeting}`;
  }

  @GetApi('/greeting/:name')
  static async helloHandler(handlerCtxt: HandlerContext, name: string) {
    return handlerCtxt.invoke(Hello).helloTransaction(name);
  }
}
